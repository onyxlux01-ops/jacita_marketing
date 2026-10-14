import { getMetaAppCredentials, metaGraphBase } from "@/lib/social/meta-client";
import { getMetaAppCredentialsForOrg } from "@/lib/social/meta-app-credentials";

export type MetaCredentialStatus =
  | { ok: true; appId: string; appName: string | null; source?: "org" | "env" }
  | { ok: false; reason: string; appId: string | null; source?: "org" | "env" };

/**
 * Live check that the Meta app id + secret are a valid pair. With an
 * organisationId, checks the app THAT business uses (its own override, else
 * the global app); without one, the global META_APP_ID / META_APP_SECRET.
 */
export async function verifyMetaCredentials(
  organisationId?: string
): Promise<MetaCredentialStatus> {
  let creds: { appId: string; appSecret: string } | null;
  let source: "org" | "env" = "env";
  if (organisationId) {
    try {
      const resolved = await getMetaAppCredentialsForOrg(organisationId);
      creds = resolved;
      source = resolved?.source ?? "env";
    } catch (e) {
      return {
        ok: false,
        reason: e instanceof Error ? e.message : "Could not load Meta app settings.",
        appId: null,
        source: "org",
      };
    }
  } else {
    creds = getMetaAppCredentials();
  }
  if (!creds) {
    return {
      ok: false,
      reason: organisationId
        ? "No Meta app is configured for this business, and META_APP_ID / META_APP_SECRET are not set."
        : "META_APP_ID or META_APP_SECRET is missing from the server environment.",
      appId: null,
      source,
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
        source,
        reason:
          json.error?.message ||
          "Meta rejected the App ID / App Secret pair. Re-copy App Secret from Meta Developers → Settings → Basic.",
      };
    }

    return {
      ok: true,
      appId: json.id || creds.appId,
      appName: json.name || null,
      source,
    };
  } catch (e) {
    return {
      ok: false,
      appId: creds.appId,
      source,
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
