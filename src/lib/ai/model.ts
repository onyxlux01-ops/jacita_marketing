import { generateText, Output } from "ai";
import { openai } from "@ai-sdk/openai";
import type { z } from "zod";

export function hasOpenAIKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export function getAiModel() {
  return openai("gpt-5-mini");
}

export type StructuredRunResult<T> =
  | { ok: true; data: T; demo: false; model: string }
  | { ok: true; data: T; demo: true; model: "demo" }
  | { ok: false; error: string; demo: boolean };

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
      };
    }

    const parsed = options.schema.safeParse(output);
    if (!parsed.success) {
      return {
        ok: true,
        data: options.fallback(),
        demo: true,
        model: "demo",
      };
    }

    return {
      ok: true,
      data: parsed.data,
      demo: false,
      model: "gpt-5-mini",
    };
  } catch {
    return {
      ok: true,
      data: options.fallback(),
      demo: true,
      model: "demo",
    };
  }
}
