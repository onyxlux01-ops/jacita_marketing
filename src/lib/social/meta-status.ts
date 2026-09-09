import { getMetaAppCredentials, metaGraphBase } from "@/lib/social/meta-client";

export type MetaCredentialStatus =
  | { ok: true; appId: string; appName: string | null }
  | { ok: false; reason: string; appId: string | null };

/**
 * Live check that META_APP_ID + META_APP_SECRET are a valid pair.
 */
export async function verifyMetaCredentials(): Promise<MetaCredentialStatus> {
  const creds = getMetaAppCredentials();
  if (!creds) {
    return {
      ok: false,
      reason: "META_APP_ID or META_APP_SECRET is missing from the server environment.",
      appId: null,
    };
  }

  try {
    const token = `${creds.appId}|${creds.appSecret}`;
    const url = `${metaGraphBase()}/${creds.appId}?fields=id,name&access_token=${encodeURIComponent(token)}`;
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json()) as {
      id?: string;
      name?: string;
      error?: { message?: string; code?: number };
    };

    if (!res.ok || json.error) {
      return {
        ok: false,
        appId: creds.appId,
        reason:
          json.error?.message ||
          "Meta rejected the App ID / App Secret pair. Re-copy App Secret from Meta Developers → Settings → Basic.",
      };
    }

    return {
      ok: true,
      appId: json.id || creds.appId,
      appName: json.name || null,
    };
  } catch (e) {
    return {
      ok: false,
      appId: creds.appId,
      reason: e instanceof Error ? e.message : "Could not reach Meta Graph API",
    };
  }
}

export function oauthRedirectChecklist(baseUrl: string) {
  const base = baseUrl.replace(/\/$/, "");
  return [
    `${base}/api/social/oauth/facebook/callback`,
    `${base}/api/social/oauth/instagram/callback`,
  ];
}
