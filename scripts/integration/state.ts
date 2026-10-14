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
  });

export function resetProviders() {
  itest.publishCalls.length = 0;
  itest.metaFetch = null;
  itest.publishDelayMs = 0;
}
