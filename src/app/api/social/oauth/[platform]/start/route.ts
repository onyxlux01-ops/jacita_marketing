import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOAuthState, oauthCallbackUrl } from "@/lib/social/oauth-state";
import { getSocialAdapter } from "@/lib/social/registry";
import { getMetaAppCredentialsForOrg } from "@/lib/social/meta-app-credentials";
import { newTikTokCodeVerifier } from "@/lib/social/adapters/tiktok";
import type { SocialPlatform } from "@/lib/types";
import { SocialIntegrationError } from "@/lib/social/types";
import { hasTokenEncryptionKey } from "@/lib/social/crypto";

const PLATFORMS: SocialPlatform[] = ["instagram", "facebook", "tiktok"];

export async function GET(
  request: Request,
  context: { params: Promise<{ platform: string }> }
) {
  const { platform: raw } = await context.params;
  const platform = raw as SocialPlatform;
  if (!PLATFORMS.includes(platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  const url = new URL(request.url);
  const organisationId = url.searchParams.get("organisation_id");
  if (!organisationId) {
    return NextResponse.json(
      { error: "organisation_id is required" },
      { status: 400 }
    );
  }

  if (!hasTokenEncryptionKey()) {
    return NextResponse.redirect(
      new URL(
        `/app/social?error=${encodeURIComponent(
          "Server token encryption is not configured (SOCIAL_TOKEN_ENCRYPTION_KEY)."
        )}`,
        url.origin
      )
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?next=/app/social", url.origin));
  }

  const { data: membership } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return NextResponse.redirect(
      new URL(
        `/app/social?error=${encodeURIComponent(
          "Only owners and managers can connect social accounts."
        )}`,
        url.origin
      )
    );
  }

  const adapter = getSocialAdapter(platform);
  const isMeta = platform === "facebook" || platform === "instagram";
  // Meta platforms resolve credentials per-business (global app only when the
  // business has no override); a lookup/decrypt failure stops the flow.
  let metaCreds: Awaited<ReturnType<typeof getMetaAppCredentialsForOrg>> = null;
  if (isMeta) {
    try {
      metaCreds = await getMetaAppCredentialsForOrg(organisationId);
    } catch (e) {
      return NextResponse.redirect(
        new URL(
          `/app/social?error=${encodeURIComponent(
            e instanceof Error ? e.message : "Could not load Meta app settings."
          )}`,
          url.origin
        )
      );
    }
  }
  const configured = isMeta ? Boolean(metaCreds) : adapter.isConfigured();
  if (!configured) {
    return NextResponse.redirect(
      new URL(
        `/app/social?error=${encodeURIComponent(
          `${platform} is not configured. Add a Meta app for this business, or set the platform's server credentials.`
        )}`,
        url.origin
      )
    );
  }

  try {
    let codeVerifier: string | undefined;
    if (platform === "tiktok") {
      codeVerifier = newTikTokCodeVerifier();
    }

    const state = await createOAuthState({
      organisationId,
      userId: user.id,
      platform,
      redirectPath: "/app/social",
      codeVerifier,
      // Bind the flow to the Meta app it was started with; the callback
      // refuses to exchange the code if the business's app changed since.
      metadata: metaCreds ? { meta_app_id: metaCreds.appId } : {},
    });

    const authUrl = adapter.getAuthorizationUrl({
      state,
      redirectUri: oauthCallbackUrl(platform, request),
      codeVerifier,
      credentials: metaCreds ?? undefined,
    });

    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message =
      error instanceof SocialIntegrationError
        ? error.userMessage || error.message
        : "Could not start social connection";
    return NextResponse.redirect(
      new URL(`/app/social?error=${encodeURIComponent(message)}`, url.origin)
    );
  }
}
