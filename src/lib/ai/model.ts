import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";

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

/** Lightweight live probe used by the Control Centre. */
export async function getAiProviderHealth(): Promise<AiProviderHealth> {
  if (!hasOpenAIKey()) {
    return {
      configured: false,
      live: false,
      model: "gpt-5-mini",
      reason: "missing_key",
      message:
        "OPENAI_API_KEY is missing. Automation will use demo fallbacks until a key is set.",
    };
  }

  try {
    const { text } = await generateText({
      model: getAiModel(),
      prompt: "Reply with exactly: ok",
      maxOutputTokens: 16,
    });
    if (!text?.trim()) {
      return {
        configured: true,
        live: false,
        model: "gpt-5-mini",
        reason: "empty_output",
        message: "OpenAI responded empty. Check the model and key.",
      };
    }
    return {
      configured: true,
      live: true,
      model: "gpt-5-mini",
      reason: null,
      message: "OpenAI is live for automation (gpt-5-mini).",
    };
  } catch (error) {
    const classified = classifyOpenAiError(error);
    return {
      configured: true,
      live: false,
      model: "gpt-5-mini",
      reason: classified.reason,
      message: classified.detail,
    };
  }
}
