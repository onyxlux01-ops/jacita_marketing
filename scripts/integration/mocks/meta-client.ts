// Mock of "@/lib/social/meta-client": keeps the real helpers but routes every
// Graph API request to the test-controlled handler (no network).
import { itest } from "../state";
import * as real from "../../../src/lib/social/meta-client";

export const metaGraphBase = real.metaGraphBase;
export const metaOAuthDialogUrl = real.metaOAuthDialogUrl;
export const getMetaAppCredentials = real.getMetaAppCredentials;

export async function metaFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string | undefined> }
): Promise<T> {
  if (!itest.metaFetch) {
    throw new Error(`[itest] unexpected Meta Graph call: ${path}`);
  }
  return (await itest.metaFetch(path, init?.searchParams || {})) as T;
}
