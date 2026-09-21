import { createHash, randomBytes } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";
import type { SocialPlatform } from "@/lib/types";

export function generateOAuthState() {
  return randomBytes(24).toString("hex");
}

export function generatePkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function createOAuthState(input: {
  organisationId: string;
  userId: string;
  platform: SocialPlatform;
  redirectPath?: string;
  codeVerifier?: string;
  metadata?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const state = generateOAuthState();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

  const { error } = await admin.from("social_oauth_states").insert({
    state,
    organisation_id: input.organisationId,
    user_id: input.userId,
    platform: input.platform,
    redirect_path: input.redirectPath || "/app/social",
    code_verifier: input.codeVerifier || null,
    metadata: (input.metadata || {}) as Json,
    expires_at: expiresAt,
  });

  if (error) throw new Error(error.message);
  return state;
}

export async function consumeOAuthState(state: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("social_oauth_states")
    .select("*")
    .eq("state", state)
    .is("consumed_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    return null;
  }

  await admin
    .from("social_oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", data.id);

  return data;
}

export function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * Build an origin (proto://host) from forwarded/host headers. Works for both
 * a route handler `Request` and a server component's `headers()` result via the
 * `get` accessor. Returns null when no host header is present.
 */
function originFromHeaders(get: (key: string) => string | null): string | null {
  const host = get("x-forwarded-host") || get("host");
  if (!host) return null;
  const proto =
    get("x-forwarded-proto") ||
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host.split(",")[0].trim()}`;
}

/** Origin of an incoming route-handler request (deployment-aware). */
export function requestOrigin(request: Request): string | null {
  try {
    return originFromHeaders((k) => request.headers.get(k));
  } catch {
    return null;
  }
}

/** Origin derived from a server component's awaited `headers()` list. */
export function headerOrigin(headerList: Headers): string | null {
  return originFromHeaders((k) => headerList.get(k));
}

/**
 * The base URL the app is actually being served from. Prefers the live request
 * host so OAuth works on any deployment (prod, preview, custom domain) without
 * per-environment config; falls back to the configured/base URL.
 */
export function resolvedAppBaseUrl(request?: Request) {
  return (request && requestOrigin(request)) || getAppBaseUrl();
}

export function oauthCallbackUrl(platform: SocialPlatform, request?: Request) {
  return `${resolvedAppBaseUrl(request)}/api/social/oauth/${platform}/callback`;
}
