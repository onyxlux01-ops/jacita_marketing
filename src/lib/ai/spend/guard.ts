import "server-only";

import { APICallError, RetryError, generateImage, generateText } from "ai";
import { currentAiSpend, type AiSpendContext } from "@/lib/ai/spend/context";
import { AiSpendError, isAiSpendError } from "@/lib/ai/spend/errors";
import { commitAiSpend, releaseAiSpend, reserveAiSpend } from "@/lib/ai/spend/ledger";
import {
  estimateImagePence,
  estimateTextPence,
  getModelPrice,
  imageQualityOf,
  imageTablePence,
  textPenceFromUsage,
  type ImageModelPrice,
  type TextModelPrice,
} from "@/lib/ai/spend/prices";

/**
 * Drop-in replacements for the AI SDK's generateText / generateImage that
 * enforce the business AI budget:
 *
 *   reserve (upper bound, in the DB, atomically) -> provider call with a
 *   timeout and NO SDK-internal retries -> commit (actual usage when the
 *   response reports it) or release.
 *
 * Retries are done here, one ledger reservation per attempt, so every
 * attempt counts against the budget.
 *
 * Settling rules:
 * - HTTP / network error from the provider (APICallError): released — the
 *   request was not served, so it is not charged.
 * - Timeout, or an error after the provider answered (e.g. the output did not
 *   match the schema): committed at the reported usage, else the estimate —
 *   the provider may have billed it.
 */

/**
 * Timeouts and retry backoff. Mutable so tests can shorten them; nothing in
 * the app changes them at runtime.
 */
export const aiGuardConfig = {
  textTimeoutMs: 90_000,
  imageTimeoutMs: 180_000,
  /** First retry waits this long, doubling per attempt. */
  retryBaseMs: 500,
  /** Never wait longer than this before a retry (also caps retry-after). */
  retryMaxWaitMs: 10_000,
};

export const TEXT_MAX_ATTEMPTS = 2;
export const IMAGE_MAX_ATTEMPTS = 1;
export const MAX_REFERENCE_IMAGES = 2;

type ModelRef = { modelId?: string; provider?: string } | string;

function modelInfo(model: unknown) {
  const ref = model as ModelRef;
  if (typeof ref === "string") return { modelId: ref, provider: "gateway" };
  return {
    modelId: String(ref?.modelId ?? "unknown"),
    provider: String(ref?.provider ?? "unknown").split(".")[0] || "unknown",
  };
}

function missingContext() {
  return new AiSpendError(
    "AI_SPEND_CONTEXT_MISSING",
    "AI call refused: it is not attached to a business, so its cost cannot be tracked."
  );
}

function refuse(ctx: AiSpendContext | null, error: AiSpendError): never {
  if (ctx) ctx.refusal = error;
  throw error;
}

function priceFor<K extends "text" | "image">(ctx: AiSpendContext, modelId: string, kind: K) {
  const price = getModelPrice(modelId);
  if (!price || price.kind !== kind) {
    refuse(
      ctx,
      new AiSpendError(
        "AI_MODEL_NOT_PRICED",
        `AI model "${modelId}" has no ${kind} price in the server price table, so it cannot be used.`
      )
    );
  }
  return price as K extends "text" ? TextModelPrice : ImageModelPrice;
}

function unwrap(error: unknown) {
  return RetryError.isInstance(error) ? error.lastError : error;
}

/** True when the provider rejected / never served the request (not charged). */
function notServed(error: unknown) {
  const e = unwrap(error);
  return APICallError.isInstance(e);
}

function retryable(error: unknown) {
  const e = unwrap(error);
  return APICallError.isInstance(e) && e.isRetryable;
}

/**
 * How long to wait before retrying: the provider's retry-after (seconds or
 * HTTP date) / retry-after-ms when present, else exponential backoff;
 * capped either way.
 */
export function retryDelayMs(error: unknown, attempt: number) {
  const e = unwrap(error);
  const headers = APICallError.isInstance(e) ? e.responseHeaders ?? {} : {};
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = String(v);
  let wait: number | null = null;
  const ms = Number(lower["retry-after-ms"]);
  if (Number.isFinite(ms) && ms >= 0) wait = ms;
  else if (lower["retry-after"] !== undefined) {
    const secs = Number(lower["retry-after"]);
    if (Number.isFinite(secs) && secs >= 0) wait = secs * 1000;
    else {
      const at = Date.parse(lower["retry-after"]);
      if (Number.isFinite(at)) wait = Math.max(0, at - Date.now());
    }
  }
  if (wait === null) wait = aiGuardConfig.retryBaseMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(wait, aiGuardConfig.retryMaxWaitMs);
}

function errorCode(error: unknown) {
  const e = unwrap(error);
  if (APICallError.isInstance(e)) return `http_${e.statusCode ?? "network"}`;
  return e instanceof Error ? e.name.slice(0, 64) : "error";
}

function usageOf(value: unknown) {
  const u = (value as { usage?: { inputTokens?: unknown; outputTokens?: unknown } } | null)
    ?.usage;
  const input = typeof u?.inputTokens === "number" ? u.inputTokens : null;
  const output = typeof u?.outputTokens === "number" ? u.outputTokens : null;
  return { inputTokens: input, outputTokens: output };
}

class AiTimeoutError extends Error {
  constructor(ms: number) {
    super(`The AI provider did not respond within ${Math.round(ms / 1000)} seconds.`);
    this.name = "AiTimeoutError";
  }
}

async function withTimeout<T>(
  ms: number,
  callerSignal: AbortSignal | undefined,
  run: (signal: AbortSignal) => PromiseLike<T>
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new AiTimeoutError(ms));
  }, ms);
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  try {
    return await run(signal);
  } catch (e) {
    if (timedOut) throw new AiTimeoutError(ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

async function guarded<T>(input: {
  ctx: AiSpendContext;
  provider: string;
  modelId: string;
  estimatedPence: number;
  imageCount: number;
  maxAttempts: number;
  timeoutMs: number;
  callerSignal: AbortSignal | undefined;
  call: (signal: AbortSignal) => PromiseLike<T>;
  actualPence: (result: T | null, error: unknown) => number | null;
}): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    let usageId: string;
    try {
      usageId = await reserveAiSpend(input.ctx, {
        provider: input.provider,
        model: input.modelId,
        estimatedPence: input.estimatedPence,
        imageCount: input.imageCount,
        attempt,
      });
    } catch (e) {
      if (isAiSpendError(e)) refuse(input.ctx, e);
      throw e;
    }

    try {
      const result = await withTimeout(input.timeoutMs, input.callerSignal, input.call);
      const usage = usageOf(result);
      await commitAiSpend(usageId, {
        actualPence: input.actualPence(result, null),
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      return result;
    } catch (error) {
      if (notServed(error)) {
        await releaseAiSpend(usageId, errorCode(error));
        if (retryable(error) && attempt < input.maxAttempts) {
          await new Promise((r) => setTimeout(r, retryDelayMs(error, attempt)));
          continue;
        }
      } else {
        const usage = usageOf(error);
        await commitAiSpend(usageId, {
          actualPence: input.actualPence(null, error),
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          errorCode: errorCode(error),
        });
      }
      throw error;
    }
  }
}

function promptChars(parts: unknown[]) {
  let n = 0;
  for (const p of parts) {
    if (p == null) continue;
    n += typeof p === "string" ? p.length : JSON.stringify(p).length;
  }
  return n;
}

/** generateText with budget reservation, timeout and counted retries. */
export const guardedGenerateText: typeof generateText = (async (options: Parameters<typeof generateText>[0]) => {
  const ctx = currentAiSpend();
  if (!ctx || !ctx.organisationId) refuse(ctx, missingContext());
  const { modelId, provider } = modelInfo(options.model);
  const price = priceFor(ctx, modelId, "text");
  const maxOutputTokens = options.maxOutputTokens ?? price.maxOutputTokens;
  const o = options as unknown as Record<string, unknown>;
  const chars = promptChars([o.system, o.instructions, o.prompt, o.messages]);

  return guarded({
    ctx,
    provider,
    modelId,
    estimatedPence: estimateTextPence(price, chars, maxOutputTokens),
    imageCount: 0,
    maxAttempts: TEXT_MAX_ATTEMPTS,
    timeoutMs: aiGuardConfig.textTimeoutMs,
    callerSignal: options.abortSignal,
    call: (signal) =>
      generateText({ ...options, maxOutputTokens, maxRetries: 0, abortSignal: signal }),
    actualPence: (result, error) => textPenceFromUsage(price, usageOf(result ?? error)),
  });
}) as typeof generateText;

/** generateImage with budget + daily image cap reservation and a timeout. */
export const guardedGenerateImage: typeof generateImage = (async (options: Parameters<typeof generateImage>[0]) => {
  const ctx = currentAiSpend();
  if (!ctx || !ctx.organisationId) refuse(ctx, missingContext());
  const { modelId, provider } = modelInfo(options.model);
  const price = priceFor(ctx, modelId, "image");

  const prompt = options.prompt as unknown;
  const text =
    typeof prompt === "string" ? prompt : String((prompt as { text?: unknown })?.text ?? "");
  const references =
    typeof prompt === "object" && prompt && Array.isArray((prompt as { images?: unknown }).images)
      ? (prompt as { images: unknown[] }).images.length
      : 0;
  if (references > MAX_REFERENCE_IMAGES) {
    refuse(
      ctx,
      new AiSpendError(
        "AI_INPUT_TOO_LARGE",
        `At most ${MAX_REFERENCE_IMAGES} reference images can be sent with one AI image.`
      )
    );
  }
  const count = Math.max(1, Math.floor(Number(options.n ?? 1)));
  const quality = imageQualityOf(
    (options.providerOptions as { openai?: { quality?: unknown } } | undefined)?.openai?.quality
  );

  return guarded({
    ctx,
    provider,
    modelId,
    estimatedPence: estimateImagePence(price, {
      count,
      size: options.size ?? null,
      quality,
      referenceImages: references,
      promptChars: text.length,
    }),
    imageCount: count,
    maxAttempts: IMAGE_MAX_ATTEMPTS,
    timeoutMs: aiGuardConfig.imageTimeoutMs,
    callerSignal: options.abortSignal,
    call: (signal) => generateImage({ ...options, maxRetries: 0, abortSignal: signal }),
    // Recorded cost: the larger of the token-based cost (when the response
    // reports usage) and the per-image table cost.
    actualPence: (result, error) =>
      Math.max(
        textPenceFromUsage(price, usageOf(result ?? error)) ?? 0,
        imageTablePence(price, { count, size: options.size ?? null, quality, referenceImages: references })
      ),
  });
}) as typeof generateImage;
