import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createOAuthState, oauthCallbackUrl } from "@/lib/social/oauth-state";
import { getSocialAdapter } from "@/lib/social/registry";
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
  if (!adapter.isConfigured()) {
    return NextResponse.redirect(
      new URL(
        `/app/social?error=${encodeURIComponent(
          `${platform} is not configured. Add platform credentials to the server environment.`
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
    });

    const authUrl = adapter.getAuthorizationUrl({
      state,
      redirectUri: oauthCallbackUrl(platform),
      codeVerifier,
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
