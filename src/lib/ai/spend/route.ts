import "server-only";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
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

/**
 * Read the body with a byte limit: stops (and throws AI_INPUT_TOO_LARGE) as
 * soon as more than maxBodyBytes arrive, so a chunked body without a
 * content-length is never fully buffered.
 */
export async function readBodyLimited(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const max = AI_INPUT_LIMITS.maxBodyBytes;
  const length = Number(request.headers.get("content-length") || 0);
  if (length > max) tooLarge("The request is too large.");
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      tooLarge("The request is too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return bytes;
}

/**
 * Bounds-check an AI route body. Returns a fresh Request carrying the same
 * bytes for the handler. Throws AiSpendError(AI_INPUT_TOO_LARGE).
 */
export async function boundedAiRequest(request: Request): Promise<Request> {
  const bytes = await readBodyLimited(request);
  const raw = new TextDecoder().decode(bytes);
  if (raw) {
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      body = undefined; // the handler reports malformed JSON as before
    }
    if (body !== undefined) checkValue(body, "", 0);
  }
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.method === "GET" || request.method === "HEAD" ? undefined : bytes,
  });
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
    // Signed-in users only, checked before the body is read. (Membership of
    // the business in the body is checked by the handler's requireOrgAccess.)
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let bounded: Request;
    try {
      bounded = await boundedAiRequest(request);
    } catch (e) {
      if (isAiSpendError(e)) return aiSpendErrorResponse(e);
      throw e;
    }
    try {
      const { response, refusal } = await runWithAiSpend({ task }, async () => {
        const response = await handler(bounded, ...rest);
        return { response, refusal: currentAiSpend()?.refusal ?? null };
      });
      return refusal ? aiSpendErrorResponse(refusal) : response;
    } catch (e) {
      if (isAiSpendError(e)) return aiSpendErrorResponse(e);
      throw e;
    }
  };
}
