import "server-only";

import { NextResponse } from "next/server";
import { currentAiSpend, runWithAiSpend } from "@/lib/ai/spend/context";
import { AiSpendError, isAiSpendError } from "@/lib/ai/spend/errors";

/**
 * Input bounds for AI route bodies (checked before the handler runs, so an
 * oversized request never reaches a paid call).
 */
export const AI_INPUT_LIMITS = {
  /** Raw JSON body. */
  maxBodyBytes: 64 * 1024,
  /** Free-text fields a user types. */
  longText: 4_000,
  /** Caption-like fields of an existing post being transformed. */
  contentText: 5_000,
  /** Any other string (ids, enums, short labels). */
  shortText: 300,
  maxArrayItems: 30,
  maxDepth: 4,
  /** Variations requested in one call. */
  maxCount: 5,
} as const;

const LONG_TEXT_FIELDS = new Set(["notes", "request_text", "preset_intent", "strategy_summary"]);
const CONTENT_TEXT_FIELDS = new Set([
  "caption",
  "hook",
  "title",
  "call_to_action",
  "video_concept",
  "on_screen_text",
  "voiceover_script",
  "alt_text",
]);

function tooLarge(message: string): never {
  throw new AiSpendError("AI_INPUT_TOO_LARGE", message);
}

function checkValue(value: unknown, key: string, depth: number) {
  if (depth > AI_INPUT_LIMITS.maxDepth) tooLarge("The request is nested too deeply.");
  if (typeof value === "string") {
    const max = LONG_TEXT_FIELDS.has(key)
      ? AI_INPUT_LIMITS.longText
      : CONTENT_TEXT_FIELDS.has(key)
        ? AI_INPUT_LIMITS.contentText
        : AI_INPUT_LIMITS.shortText;
    if (value.length > max) {
      tooLarge(`"${key}" is too long (${value.length} characters; the limit is ${max}).`);
    }
    return;
  }
  if (typeof value === "number") {
    if (key === "count" && (value > AI_INPUT_LIMITS.maxCount || value < 1)) {
      tooLarge(`"count" must be between 1 and ${AI_INPUT_LIMITS.maxCount}.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > AI_INPUT_LIMITS.maxArrayItems) {
      tooLarge(`"${key}" has too many items (limit ${AI_INPUT_LIMITS.maxArrayItems}).`);
    }
    for (const item of value) checkValue(item, key, depth + 1);
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) checkValue(v, k, depth + 1);
  }
}

/** Throws AiSpendError(AI_INPUT_TOO_LARGE) when a JSON body is out of bounds. */
export async function assertAiInputBounds(request: Request) {
  const length = Number(request.headers.get("content-length") || 0);
  if (length > AI_INPUT_LIMITS.maxBodyBytes) tooLarge("The request is too large.");
  const raw = await request.clone().text();
  if (raw.length > AI_INPUT_LIMITS.maxBodyBytes) tooLarge("The request is too large.");
  if (!raw) return;
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return; // the handler reports malformed JSON as before
  }
  checkValue(body, "", 0);
}

export function aiSpendErrorResponse(error: AiSpendError) {
  const headers: Record<string, string> = {};
  if (error.code === "AI_CONCURRENCY_LIMIT") headers["Retry-After"] = "15";
  return NextResponse.json(error.toJSON(), { status: error.status, headers });
}

/**
 * Wrap an AI API route: bounds the input, runs the handler inside an AI
 * spend context (requireOrgAccess binds the business and user), and turns a
 * spend refusal into a clear JSON error (429 for budget / image cap /
 * concurrency) — even when the handler caught the refusal and answered with
 * its own error.
 */
export function withAiRoute<A extends unknown[]>(
  task: string,
  handler: (request: Request, ...rest: A) => Promise<Response>
) {
  return async (request: Request, ...rest: A): Promise<Response> => {
    try {
      await assertAiInputBounds(request);
    } catch (e) {
      if (isAiSpendError(e)) return aiSpendErrorResponse(e);
      throw e;
    }
    try {
      const { response, refusal } = await runWithAiSpend({ task }, async () => {
        const response = await handler(request, ...rest);
        return { response, refusal: currentAiSpend()?.refusal ?? null };
      });
      return refusal ? aiSpendErrorResponse(refusal) : response;
    } catch (e) {
      if (isAiSpendError(e)) return aiSpendErrorResponse(e);
      throw e;
    }
  };
}
