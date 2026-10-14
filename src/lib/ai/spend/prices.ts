/**
 * AI price table — ESTIMATES in GBP pence. The owner must confirm every value
 * against the provider's current pricing page before go-live (see README).
 *
 * How the numbers were derived (14 Oct 2026):
 * - USD list prices converted at an assumed 0.80 GBP per USD, then rounded
 *   UP so reservations err on the side of over-counting.
 * - gpt-5-mini: OpenAI list price $0.25 / 1M input, $2.00 / 1M output tokens.
 * - gpt-image-*: NO confirmed price for the ids this app uses
 *   ("gpt-image-2.5-sunburst", "gpt-image-2"). The values below are GUESSES
 *   based on gpt-image-1 (high quality ~$0.17 square, ~$0.25 portrait or
 *   landscape) with roughly 50% headroom.
 *
 * A model that is not in this table cannot be called: the spend guard
 * refuses it (AI_MODEL_NOT_PRICED) rather than guessing.
 */

export type TextModelPrice = {
  kind: "text";
  /** Pence per 1,000 input tokens. */
  inputPer1k: number;
  /** Pence per 1,000 output tokens (reasoning tokens are billed as output). */
  outputPer1k: number;
  /**
   * Output-token ceiling the guard sends with every call, so the
   * reservation is a real upper bound.
   */
  maxOutputTokens: number;
  confirmed: boolean;
};

export type ImageQuality = "low" | "medium" | "high";

export type ImageModelPrice = {
  kind: "image";
  /** Pence per generated image, by quality and by square vs. portrait/landscape. */
  perImage: Record<ImageQuality, { square: number; tall: number }>;
  /** Pence per reference (input) image sent for editing. */
  perReferenceImage: number;
  /** Pence per 1,000 input tokens (text + image), when the response reports usage. */
  inputPer1k: number;
  /** Pence per 1,000 output (image) tokens, when the response reports usage. */
  outputPer1k: number;
  confirmed: boolean;
};

const GPT_IMAGE_GUESS: ImageModelPrice = {
  kind: "image",
  perImage: {
    low: { square: 2, tall: 3 },
    medium: { square: 8, tall: 12 },
    high: { square: 25, tall: 35 },
  },
  perReferenceImage: 8,
  inputPer1k: 1,
  outputPer1k: 4,
  confirmed: false,
};

export const AI_PRICE_TABLE: Record<string, TextModelPrice | ImageModelPrice> = {
  "gpt-5-mini": {
    kind: "text",
    inputPer1k: 0.025,
    outputPer1k: 0.2,
    maxOutputTokens: 16_000,
    confirmed: false,
  },
  "gpt-image-2.5-sunburst": GPT_IMAGE_GUESS,
  "gpt-image-2": GPT_IMAGE_GUESS,
};

/**
 * Rough tokens for a prompt of `chars` characters: English averages ~4
 * characters per token; 3 over-counts on purpose. The overhead covers the
 * structured-output JSON schema and message framing the SDK adds.
 */
export const CHARS_PER_TOKEN_ESTIMATE = 3;
export const PROMPT_OVERHEAD_TOKENS = 4_000;

export function getModelPrice(modelId: string) {
  return AI_PRICE_TABLE[modelId] ?? null;
}

function round4(pence: number) {
  return Math.ceil(pence * 10_000) / 10_000;
}

export function estimateTextInputTokens(promptChars: number) {
  return Math.ceil(promptChars / CHARS_PER_TOKEN_ESTIMATE) + PROMPT_OVERHEAD_TOKENS;
}

/** Upper-bound pence for one text call. */
export function estimateTextPence(
  price: TextModelPrice,
  promptChars: number,
  maxOutputTokens: number
) {
  const input = estimateTextInputTokens(promptChars);
  return round4((input / 1000) * price.inputPer1k + (maxOutputTokens / 1000) * price.outputPer1k);
}

/** Pence from the token usage a response reports, or null when it reports none. */
export function textPenceFromUsage(
  price: { inputPer1k: number; outputPer1k: number },
  usage: { inputTokens?: number | null; outputTokens?: number | null } | null | undefined
) {
  const input = usage?.inputTokens;
  const output = usage?.outputTokens;
  if (typeof input !== "number" || typeof output !== "number") return null;
  return round4((input / 1000) * price.inputPer1k + (output / 1000) * price.outputPer1k);
}

export function imageQualityOf(value: unknown): ImageQuality {
  return value === "low" || value === "medium" ? value : "high";
}

/** Upper-bound pence for generating `count` images. */
export function estimateImagePence(
  price: ImageModelPrice,
  options: {
    count: number;
    size?: string | null;
    quality: ImageQuality;
    referenceImages: number;
    promptChars: number;
  }
) {
  const square = !options.size || options.size === "1024x1024";
  const each = price.perImage[options.quality][square ? "square" : "tall"];
  const promptTokens = estimateTextInputTokens(options.promptChars);
  return round4(
    options.count * each +
      options.referenceImages * price.perReferenceImage +
      (promptTokens / 1000) * price.inputPer1k
  );
}
