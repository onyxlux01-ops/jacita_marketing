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

export function oauthCallbackUrl(platform: SocialPlatform) {
  return `${getAppBaseUrl()}/api/social/oauth/${platform}/callback`;
}
