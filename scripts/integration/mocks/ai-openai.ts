// Mock of "@ai-sdk/openai": the real AI SDK (generateText / generateImage,
// structured-output parsing, usage) runs against AI SDK mock models whose
// behaviour the tests set in itest. No request reaches OpenAI.
import { APICallError } from "ai";
import { MockImageModelV4, MockLanguageModelV4 } from "ai/test";
import { itest } from "../state";

// 1x1 transparent PNG.
const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function latency(signal?: AbortSignal) {
  if (!itest.aiDelayMs) return;
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, itest.aiDelayMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error("aborted"));
    });
  });
}

function httpError(status: number, retryable: boolean) {
  return new APICallError({
    message: `[itest] mocked OpenAI HTTP ${status}`,
    url: "https://api.openai.invalid/v1/mock",
    requestBodyValues: {},
    statusCode: status,
    isRetryable: retryable,
  });
}

function textModel(modelId: string) {
  return new MockLanguageModelV4({
    provider: "openai.responses",
    modelId,
    doGenerate: async (options) => {
      itest.aiCalls.push({ kind: "text", modelId });
      await latency(options.abortSignal);
      if (itest.aiFail) throw httpError(itest.aiFail.status, itest.aiFail.retryable);
      // No reply configured: behave like an unavailable provider (not charged).
      if (!itest.aiText) throw httpError(503, false);
      const reply = itest.aiText();
      const input = reply.inputTokens ?? 1000;
      const output = reply.outputTokens ?? 500;
      return {
        content: [{ type: "text", text: reply.text }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: { total: input, noCache: input, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: output, text: output, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

function imageModel(modelId: string) {
  return new MockImageModelV4({
    provider: "openai.image",
    modelId,
    doGenerate: async (options) => {
      itest.aiCalls.push({ kind: "image", modelId });
      await latency(options.abortSignal);
      if (itest.aiFail) throw httpError(itest.aiFail.status, itest.aiFail.retryable);
      return {
        images: [PNG_1X1],
        warnings: [],
        response: { timestamp: new Date(), modelId, headers: {} },
      };
    },
  });
}

export const openai = Object.assign((modelId: string) => textModel(modelId), {
  responses: (modelId: string) => textModel(modelId),
  chat: (modelId: string) => textModel(modelId),
  image: (modelId: string) => imageModel(modelId),
});

export function createOpenAI() {
  return openai;
}
