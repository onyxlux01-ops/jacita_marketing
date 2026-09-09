const DEFAULT_VERSION = process.env.META_GRAPH_API_VERSION || "v22.0";

export function metaGraphBase() {
  return `https://graph.facebook.com/${DEFAULT_VERSION}`;
}

export function metaOAuthDialogUrl(params: Record<string, string>) {
  const q = new URLSearchParams(params);
  return `https://www.facebook.com/${DEFAULT_VERSION}/dialog/oauth?${q}`;
}

export function getMetaAppCredentials() {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;
  if (!appId || !appSecret) return null;
  return { appId, appSecret };
}

export async function metaFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit & { searchParams?: Record<string, string | undefined> }
) {
  const url = new URL(
    path.startsWith("http") ? path : `${metaGraphBase()}${path}`
  );
  if (init?.searchParams) {
    for (const [k, v] of Object.entries(init.searchParams)) {
      if (v != null) url.searchParams.set(k, v);
    }
  }
  const { searchParams: _sp, ...rest } = init || {};
  const res = await fetch(url.toString(), rest);
  const json = (await res.json()) as T & {
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!res.ok || json.error) {
    const message = json.error?.message || `Meta API error (${res.status})`;
    throw new Error(message);
  }
  return json;
}
