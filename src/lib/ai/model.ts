import { Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";
import { guardedGenerateText as generateText, isAiSpendError } from "@/lib/ai/spend";

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getAiModel() {
  return openai("gpt-5-mini");
}

export type AiFallbackReason =
  | "missing_key"
  | "billing"
  | "invalid_key"
  | "rate_limit"
  | "empty_output"
  | "parse_error"
  | "api_error";

export type StructuredRunResult<T> =
  | { ok: true; data: T; demo: false; model: string }
  | {
      ok: true;
      data: T;
      demo: true;
      model: "demo";
      reason?: AiFallbackReason;
      detail?: string;
    }
  | { ok: false; error: string; demo: boolean };

export function classifyOpenAiError(error: unknown): {
  reason: AiFallbackReason;
  detail: string;
} {
  const raw =
    error instanceof Error
      ? `${error.message} ${String((error as { cause?: unknown }).cause || "")}`
      : String(error);
  const text = raw.toLowerCase();

  if (
    text.includes("no credits remaining") ||
    text.includes("insufficient_quota") ||
    text.includes("billing") ||
    text.includes("exceeded your current quota")
  ) {
    return {
      reason: "billing",
      detail:
        "OpenAI has no credits remaining. Add billing credits at platform.openai.com to use live AI.",
    };
  }
  if (
    text.includes("incorrect api key") ||
    text.includes("invalid_api_key") ||
    text.includes("authentication") ||
    (text.includes("unauthorized") && !text.includes("max_output_tokens"))
  ) {
    return {
      reason: "invalid_key",
      detail: "OPENAI_API_KEY is invalid. Replace it in .env.local and Vercel.",
    };
  }
  if (text.includes("rate limit") || text.includes("429")) {
    return {
      reason: "rate_limit",
      detail: "OpenAI rate limit hit. Retry shortly.",
    };
  }
  return {
    reason: "api_error",
    detail: raw.slice(0, 280) || "OpenAI request failed.",
  };
}

export async function runStructured<T>(options: {
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  fallback: () => T;
}): Promise<StructuredRunResult<T>> {
  if (!hasOpenAIKey()) {
    return {
      ok: true,
      data: options.fallback(),
      demo: true,
      model: "demo",
      reason: "missing_key",
      detail:
        "OPENAI_API_KEY is not set. Add it to .env.local and Vercel environment variables.",
    };
  }

  try {
    const { output } = await generateText({
      model: getAiModel(),
      output: Output.object({ schema: options.schema }),
      system: options.system,
      prompt: options.prompt,
    });

    if (!output) {
      return {
        ok: true,
        data: options.fallback(),
        demo: true,
        model: "demo",
        reason: "empty_output",
        detail: "OpenAI returned an empty response; using safe demo content.",
      };
    }

    const parsed = options.schema.safeParse(output);
    if (!parsed.success) {
      return {
        ok: true,
        data: options.fallback(),
        demo: true,
        model: "demo",
        reason: "parse_error",
        detail: "OpenAI output did not match the expected schema.",
      };
    }

    return {
      ok: true,
      data: parsed.data,
      demo: false,
      model: "gpt-5-mini",
    };
  } catch (error) {
    // Budget / cap / concurrency refusals are not provider failures: never
    // hide them behind demo content.
    if (isAiSpendError(error)) throw error;
    const classified = classifyOpenAiError(error);
    return {
      ok: true,
      data: options.fallback(),
      demo: true,
      model: "demo",
      reason: classified.reason,
      detail: classified.detail,
    };
  }
}

export type AiProviderHealth = {
  configured: boolean;
  live: boolean;
  model: string;
  reason: AiFallbackReason | null;
  message: string;
};

const HEALTH_TTL_MS = 10 * 60 * 1000;
const HEALTH_TIMEOUT_MS = 10_000;

type HealthCache = { at: number; key: string; value: AiProviderHealth };
const healthStore = globalThis as unknown as { __jacitaAiHealth?: HealthCache | null };

/** Test hook: forget the cached health result. */
export function resetAiProviderHealthCache() {
  healthStore.__jacitaAiHealth = null;
}

/**
 * Provider check used by the Automation page. It looks the model up in
 * OpenAI's models list (a free call: no tokens, no images), so it is not
 * charged to any business and does not take a user's in-flight slot. The
 * result is cached for 10 minutes per process.
 *
 * It proves the key works and the model is available to it; it cannot see
 * whether the account has credit (a billing problem shows up on the first
 * real call instead).
 */
export async function getAiProviderHealth(): Promise<AiProviderHealth> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return {
      configured: false,
      live: false,
      model: "gpt-5-mini",
      reason: "missing_key",
      message:
        "OPENAI_API_KEY is missing. Automation will use demo fallbacks until a key is set.",
    };
  }

  const cached = healthStore.__jacitaAiHealth;
  if (cached && cached.key === key && Date.now() - cached.at < HEALTH_TTL_MS) {
    return cached.value;
  }

  let value: AiProviderHealth;
  try {
    const res = await fetch("https://api.openai.com/v1/models/gpt-5-mini", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (res.ok) {
      value = {
        configured: true,
        live: true,
        model: "gpt-5-mini",
        reason: null,
        message: "OpenAI key works and gpt-5-mini is available.",
      };
    } else if (res.status === 401) {
      value = {
        configured: true,
        live: false,
        model: "gpt-5-mini",
        reason: "invalid_key",
        message: "OPENAI_API_KEY is invalid. Replace it in .env.local and Vercel.",
      };
    } else if (res.status === 404) {
      value = {
        configured: true,
        live: false,
        model: "gpt-5-mini",
        reason: "api_error",
        message: "gpt-5-mini is not available to this OpenAI key.",
      };
    } else if (res.status === 429) {
      value = {
        configured: true,
        live: false,
        model: "gpt-5-mini",
        reason: "rate_limit",
        message: "OpenAI rate limit hit. Retry shortly.",
      };
    } else {
      value = {
        configured: true,
        live: false,
        model: "gpt-5-mini",
        reason: "api_error",
        message: `OpenAI check failed (HTTP ${res.status}).`,
      };
    }
  } catch (error) {
    const classified = classifyOpenAiError(error);
    value = {
      configured: true,
      live: false,
      model: "gpt-5-mini",
      reason: classified.reason,
      message: classified.detail,
    };
  }

  healthStore.__jacitaAiHealth = { at: Date.now(), key, value };
  return value;
}
