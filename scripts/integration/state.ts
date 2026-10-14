/**
 * Shared, mutable state between integration tests and the module mocks.
 * Tests set the acting user's Supabase client and provider behaviour here;
 * the mocks read it when application code calls them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PublishCall = {
  platform: string;
  externalAccountId: string;
  contentId: string;
  organisationId: string;
};

export type MetaFetchHandler = (
  path: string,
  searchParams: Record<string, string | undefined>
) => unknown;

export type AiCall = { kind: "text" | "image"; modelId: string };

/** Mocked OpenAI text reply (JSON text + reported token usage). */
export type AiTextReply = { text: string; inputTokens?: number; outputTokens?: number };

type State = {
  /** Client used by the mocked `@/lib/supabase/server` createClient(). */
  userClient: SupabaseClient | null;
  /** Every adapter.publish() call that reached the (mocked) provider. */
  publishCalls: PublishCall[];
  /** Mocked Meta Graph API. Throw to simulate a Graph error. */
  metaFetch: MetaFetchHandler | null;
  postCounter: number;
  /** Simulated provider latency, to make concurrent requests overlap. */
  publishDelayMs: number;
  /** When set, adapter.publish() throws this message AFTER recording the call. */
  publishError: string | null;
  /** Every call that reached the mocked OpenAI provider (@ai-sdk/openai). */
  aiCalls: AiCall[];
  /** Text reply; null = the mock answers with an HTTP 503 (not charged). */
  aiText: (() => AiTextReply) | null;
  /** When set, every mocked AI call fails with this HTTP status. */
  aiFail: { status: number; retryable: boolean; headers?: Record<string, string> } | null;
  /** Simulated provider latency (ms), to make concurrent calls overlap. */
  aiDelayMs: number;
};

const g = globalThis as unknown as { __jacitaItest?: State };

export const itest: State =
  g.__jacitaItest ??
  (g.__jacitaItest = {
    userClient: null,
    publishCalls: [],
    metaFetch: null,
    postCounter: 0,
    publishDelayMs: 0,
    publishError: null,
    aiCalls: [],
    aiText: null,
    aiFail: null,
    aiDelayMs: 0,
  });

export function resetProviders() {
  itest.publishCalls.length = 0;
  itest.metaFetch = null;
  itest.publishDelayMs = 0;
  itest.publishError = null;
  itest.aiCalls.length = 0;
  itest.aiText = null;
  itest.aiFail = null;
  itest.aiDelayMs = 0;
}
