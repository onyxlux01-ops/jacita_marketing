import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { consumeOAuthState, oauthCallbackUrl } from "@/lib/social/oauth-state";
import { getSocialAdapter } from "@/lib/social/registry";
import { saveAccountSecrets } from "@/lib/social/secrets";
import type { Json } from "@/lib/database.types";
import type { SocialPlatform } from "@/lib/types";
import { SocialIntegrationError } from "@/lib/social/types";

const PLATFORMS: SocialPlatform[] = ["instagram", "facebook", "tiktok"];

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform: raw } = await context.params;
  const platform = raw as SocialPlatform;
  const url = new URL(request.url);
  const origin = url.origin;

  if (!PLATFORMS.includes(platform)) {
    return NextResponse.redirect(
      new URL("/app/social?error=Unknown%20platform", origin)
    );
  }

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const errorDescription = url.searchParams.get("error_description");

  if (oauthError) {
    return NextResponse.redirect(
      new URL(
        `/app/social?error=${encodeURIComponent(
          errorDescription || oauthError
        )}`,
        origin
      )
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/app/social?error=Missing%20OAuth%20code", origin)
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/app/social", origin));
  }

  const oauthState = await consumeOAuthState(state);
  if (!oauthState || oauthState.user_id !== user.id) {
    return NextResponse.redirect(
      new URL(
        `/app/social?error=${encodeURIComponent(
          "Invalid or expired OAuth state. Please try connecting again."
        )}`,
        origin
      )
    );
  }

  if (oauthState.platform !== platform) {
    return NextResponse.redirect(
      new URL("/app/social?error=Platform%20mismatch", origin)
    );
  }

  // Re-verify membership at callback — never trust start-time alone
  const { data: membership } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", oauthState.organisation_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return NextResponse.redirect(
      new URL(
        `/app/social?error=${encodeURIComponent(
          "You no longer have permission to connect accounts for this business."
        )}`,
        origin
      )
    );
  }

  const adapter = getSocialAdapter(platform);
  const admin = createAdminClient();

  try {
    const connected = await adapter.exchangeCode({
      code,
      redirectUri: oauthCallbackUrl(platform),
      codeVerifier: oauthState.code_verifier || undefined,
    });

    // Upsert social_accounts for this org+platform
    const { data: existing } = await admin
      .from("social_accounts")
      .select("id")
      .eq("organisation_id", oauthState.organisation_id)
      .eq("platform", platform)
      .maybeSingle();

    let accountId = existing?.id;
    if (accountId) {
      await admin
        .from("social_accounts")
        .update({
          account_name: connected.accountName,
          account_handle: connected.accountHandle,
          profile_image_url: connected.profileImageUrl,
          connection_status: "connected",
          external_account_id: connected.externalAccountId,
          scopes: connected.scopes,
          token_expires_at: connected.token.expiresAt || null,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
          last_error: null,
          metadata: (connected.metadata || {}) as Json,
        })
        .eq("id", accountId)
        .eq("organisation_id", oauthState.organisation_id);
    } else {
      const { data: created, error } = await admin
        .from("social_accounts")
        .insert({
          organisation_id: oauthState.organisation_id,
          platform,
          account_name: connected.accountName,
          account_handle: connected.accountHandle,
          profile_image_url: connected.profileImageUrl,
          connection_status: "connected",
          external_account_id: connected.externalAccountId,
          scopes: connected.scopes,
          token_expires_at: connected.token.expiresAt || null,
          connected_at: new Date().toISOString(),
          metadata: (connected.metadata || {}) as Json,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      accountId = created.id;
    }

    await saveAccountSecrets({
      socialAccountId: accountId!,
      organisationId: oauthState.organisation_id,
      token: connected.token,
    });

    await admin.from("audit_logs").insert({
      organisation_id: oauthState.organisation_id,
      user_id: user.id,
      action: "social.connected",
      entity_type: "social_accounts",
      entity_id: accountId!,
      metadata: { platform, handle: connected.accountHandle },
    });

    return NextResponse.redirect(
      new URL(
        `/app/social?connected=${encodeURIComponent(platform)}`,
        origin
      )
    );
  } catch (error) {
    const message =
      error instanceof SocialIntegrationError
        ? error.userMessage || error.message
        : "Connection failed";
    // Do not log tokens
    console.error("oauth callback failed", platform, message);
    return NextResponse.redirect(
      new URL(`/app/social?error=${encodeURIComponent(message)}`, origin)
    );
  }
}
