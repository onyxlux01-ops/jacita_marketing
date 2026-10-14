import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  consumeOAuthState,
  oauthCallbackUrl,
  oauthStateMetaAppId,
} from "@/lib/social/oauth-state";
import { holdJobsForAccountChange } from "@/lib/social/account-switch";
import { getSocialAdapter } from "@/lib/social/registry";
import { getMetaAppCredentialsForOrg } from "@/lib/social/meta-app-credentials";
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

  // Atomic, single-use consumption bound to this user + platform + expiry.
  let oauthState: Awaited<ReturnType<typeof consumeOAuthState>> = null;
  try {
    oauthState = await consumeOAuthState({ state, userId: user.id, platform });
  } catch {
    oauthState = null;
  }
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
    const isMeta = platform === "facebook" || platform === "instagram";
    // Throws (→ error redirect) if the business's Meta app can't be loaded;
    // never silently swaps in the global app.
    const metaCreds = isMeta
      ? await getMetaAppCredentialsForOrg(oauthState.organisation_id)
      : null;

    if (isMeta) {
      const startedWith = oauthStateMetaAppId(oauthState);
      if (!metaCreds || !startedWith || startedWith !== metaCreds.appId) {
        return NextResponse.redirect(
          new URL(
            `/app/social?error=${encodeURIComponent(
              "This business's Meta app changed while you were connecting. Please connect again."
            )}`,
            origin
          )
        );
      }
    }

    const connected = await adapter.exchangeCode({
      code,
      redirectUri: oauthCallbackUrl(platform, request),
      codeVerifier: oauthState.code_verifier || undefined,
      credentials: metaCreds ?? undefined,
    });

    // Upsert social_accounts for this org+platform
    const { data: existing, error: existingError } = await admin
      .from("social_accounts")
      .select("id, external_account_id")
      .eq("organisation_id", oauthState.organisation_id)
      .eq("platform", platform)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    let accountId = existing?.id;
    const previousExternalId = existing?.external_account_id ?? null;
    if (accountId) {
      // Reconnecting a DIFFERENT account: hold queued posts for re-approval
      // before the row points elsewhere (throws → abort).
      if (
        previousExternalId &&
        previousExternalId !== connected.externalAccountId
      ) {
        await holdJobsForAccountChange(admin, {
          organisationId: oauthState.organisation_id,
          socialAccountId: accountId,
          oldExternalId: previousExternalId,
          newExternalId: connected.externalAccountId,
        });
      }
      const { error: updateError } = await admin
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
      if (updateError) throw new Error(updateError.message);
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

    try {
      await saveAccountSecrets({
        socialAccountId: accountId!,
        organisationId: oauthState.organisation_id,
        token: connected.token,
      });
    } catch (e) {
      // Row and token must not disagree: mark the connection unusable.
      await admin
        .from("social_accounts")
        .update({
          connection_status: "error",
          last_error: "Credentials could not be stored. Reconnect.",
        })
        .eq("id", accountId!)
        .eq("organisation_id", oauthState.organisation_id);
      throw e;
    }

    await admin.from("audit_logs").insert({
      organisation_id: oauthState.organisation_id,
      user_id: user.id,
      action: "social.connected",
      entity_type: "social_accounts",
      entity_id: accountId!,
      metadata: {
        platform,
        handle: connected.accountHandle,
        old_external_account_id: previousExternalId,
        new_external_account_id: connected.externalAccountId,
        meta_app_id: metaCreds?.appId ?? null,
      },
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
