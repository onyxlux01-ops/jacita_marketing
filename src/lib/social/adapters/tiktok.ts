import { createHash, randomBytes } from "crypto";
import type {
  ConnectedAccountInfo,
  PublishContentInput,
  PublishResult,
  PublishStatusResult,
  SocialPlatformAdapter,
  TokenBundle,
  ValidationIssue,
} from "@/lib/social/types";
import { SocialIntegrationError } from "@/lib/social/types";

const TIKTOK_AUTH = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_API = "https://open.tiktokapis.com";

function getTikTokCredentials() {
  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;
  if (!clientKey || !clientSecret) return null;
  return { clientKey, clientSecret };
}

/**
 * TikTok Content Posting API adapter.
 * Direct Post requires video.publish + TikTok audit for public posts.
 * MEDIA_UPLOAD (inbox draft) uses video.upload and works with fewer review gates.
 */
export const tiktokAdapter: SocialPlatformAdapter = {
  platform: "tiktok",

  isConfigured() {
    return Boolean(getTikTokCredentials());
  },

  getAuthorizationUrl({ state, redirectUri, codeVerifier }) {
    const creds = getTikTokCredentials();
    if (!creds) {
      throw new SocialIntegrationError(
        "TikTok app not configured",
        "not_configured",
        "TikTok connection is not configured yet. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET."
      );
    }
    const challenge = codeVerifier
      ? createHash("sha256").update(codeVerifier).digest("base64url")
      : undefined;
    const params = new URLSearchParams({
      client_key: creds.clientKey,
      response_type: "code",
      scope: "user.info.basic,video.upload,video.publish",
      redirect_uri: redirectUri,
      state,
    });
    if (challenge) {
      params.set("code_challenge", challenge);
      params.set("code_challenge_method", "S256");
    }
    return `${TIKTOK_AUTH}?${params.toString()}`;
  },

  async exchangeCode({ code, redirectUri, codeVerifier }) {
    const creds = getTikTokCredentials();
    if (!creds) {
      throw new SocialIntegrationError(
        "TikTok app not configured",
        "not_configured"
      );
    }

    const tokenRes = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: creds.clientKey,
        client_secret: creds.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
      }),
    });
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      refresh_expires_in?: number;
      scope?: string;
      open_id?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenRes.ok || !tokenJson.access_token) {
      throw new SocialIntegrationError(
        tokenJson.error_description || "TikTok OAuth failed",
        "oauth_failed",
        "Could not connect TikTok. Check app credentials and redirect URI."
      );
    }

    const userRes = await fetch(
      `${TIKTOK_API}/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username`,
      {
        headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      }
    );
    const userJson = (await userRes.json()) as {
      data?: {
        user?: {
          open_id?: string;
          display_name?: string;
          username?: string;
          avatar_url?: string;
        };
      };
    };
    const user = userJson.data?.user;
    const openId = user?.open_id || tokenJson.open_id;
    if (!openId) {
      throw new SocialIntegrationError(
        "TikTok user id missing",
        "oauth_failed"
      );
    }

    // Probe creator_info to record publish readiness (direct post vs upload)
    let creatorInfo: Record<string, unknown> | null = null;
    let directPostReady = false;
    try {
      const creatorRes = await fetch(
        `${TIKTOK_API}/v2/post/publish/creator_info/query/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokenJson.access_token}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
        }
      );
      const creatorJson = (await creatorRes.json()) as {
        data?: Record<string, unknown>;
        error?: { code?: string; message?: string };
      };
      if (creatorRes.ok && creatorJson.data) {
        creatorInfo = creatorJson.data;
        directPostReady = true;
      }
    } catch {
      directPostReady = false;
    }

    const expiresAt = tokenJson.expires_in
      ? new Date(Date.now() + tokenJson.expires_in * 1000).toISOString()
      : null;

    return {
      externalAccountId: openId,
      accountName: user?.display_name || null,
      accountHandle: user?.username ? `@${user.username}` : user?.display_name || null,
      profileImageUrl: user?.avatar_url || null,
      scopes: (tokenJson.scope || "").split(",").filter(Boolean),
      metadata: {
        open_id: openId,
        creator_info: creatorInfo,
        direct_post_ready: directPostReady,
        /** Unaudited apps must use SELF_ONLY / MEDIA_UPLOAD */
        audit_required_for_public: true,
        preferred_post_mode: directPostReady ? "DIRECT_POST" : "MEDIA_UPLOAD",
      },
      token: {
        accessToken: tokenJson.access_token,
        refreshToken: tokenJson.refresh_token || null,
        expiresAt,
        tokenType: "bearer",
      },
    } satisfies ConnectedAccountInfo;
  },

  async refreshToken(token: TokenBundle) {
    const creds = getTikTokCredentials();
    if (!creds || !token.refreshToken) {
      throw new SocialIntegrationError(
        "Cannot refresh TikTok token",
        "token_expired",
        "Reconnect TikTok — the session could not be refreshed."
      );
    }
    const res = await fetch(`${TIKTOK_API}/v2/oauth/token/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: creds.clientKey,
        client_secret: creds.clientSecret,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!res.ok || !json.access_token) {
      throw new SocialIntegrationError(
        "TikTok refresh failed",
        "token_expired",
        "Reconnect TikTok — the connection expired."
      );
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token || token.refreshToken,
      expiresAt: json.expires_in
        ? new Date(Date.now() + json.expires_in * 1000).toISOString()
        : token.expiresAt,
      tokenType: "bearer",
    };
  },

  validatePublish(input: PublishContentInput): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!input.media.length) {
      issues.push({
        code: "media_required",
        message: "TikTok publishing requires a photo or video.",
      });
    }
    if (input.caption.length > 2200) {
      issues.push({
        code: "caption_length",
        message: "TikTok captions must be 2,200 characters or fewer.",
      });
    }
    if (!input.tiktok?.privacyLevel) {
      issues.push({
        code: "privacy_required",
        message:
          "TikTok requires a privacy level selected from the creator’s available options.",
      });
    }
    for (const media of input.media) {
      if (
        media.mediaType === "video" &&
        media.mimeType &&
        !/video\/(mp4|quicktime|webm)/i.test(media.mimeType)
      ) {
        issues.push({
          code: "video_format",
          message:
            "This video is not suitable for TikTok because the file format is unsupported.",
        });
      }
    }
    return issues;
  },

  async publish(
    token: TokenBundle,
    _account: { externalAccountId: string; metadata?: Record<string, unknown> },
    input: PublishContentInput
  ): Promise<PublishResult> {
    const media = input.media[0];
    if (!media) {
      throw new SocialIntegrationError("Media required", "validation");
    }

    // Official requirement: query creator info before posting
    const creatorRes = await fetch(
      `${TIKTOK_API}/v2/post/publish/creator_info/query/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
      }
    );
    const creatorJson = (await creatorRes.json()) as {
      data?: {
        privacy_level_options?: string[];
        max_video_post_duration_sec?: number;
        creator_nickname?: string;
      };
      error?: { code?: string; message?: string };
    };
    if (!creatorRes.ok || creatorJson.error?.code === "access_token_invalid") {
      throw new SocialIntegrationError(
        creatorJson.error?.message || "creator_info failed",
        "token_expired",
        "TikTok session expired. Reconnect the account."
      );
    }

    const privacyOptions = creatorJson.data?.privacy_level_options || [];
    const privacy =
      input.tiktok?.privacyLevel &&
      privacyOptions.includes(input.tiktok.privacyLevel)
        ? input.tiktok.privacyLevel
        : privacyOptions.includes("SELF_ONLY")
          ? "SELF_ONLY"
          : privacyOptions[0];

    if (!privacy) {
      throw new SocialIntegrationError(
        "No TikTok privacy options",
        "permission_revoked",
        "TikTok did not return privacy options for this creator. Reconnect or check app permissions."
      );
    }

    const postMode =
      input.tiktok?.postMode ||
      (process.env.TIKTOK_DIRECT_POST_ENABLED === "true"
        ? "DIRECT_POST"
        : "MEDIA_UPLOAD");

    if (media.mediaType === "image") {
      const initRes = await fetch(
        `${TIKTOK_API}/v2/post/publish/content/init/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({
            media_type: "PHOTO",
            post_mode: postMode,
            post_info: {
              title: (input.title || input.caption).slice(0, 90),
              description: input.caption,
              privacy_level: privacy,
              disable_comment: input.tiktok?.disableComment ?? false,
              auto_add_music: true,
            },
            source_info: {
              source: "PULL_FROM_URL",
              photo_cover_index: 0,
              photo_images: [media.publicUrl],
            },
          }),
        }
      );
      const initJson = (await initRes.json()) as {
        data?: { publish_id?: string };
        error?: { code?: string; message?: string };
      };
      if (!initRes.ok || !initJson.data?.publish_id) {
        throw new SocialIntegrationError(
          initJson.error?.message || "TikTok photo init failed",
          "platform_error",
          initJson.error?.message ||
            "TikTok could not start the photo publish. Check media URL domain allowlisting and permissions."
        );
      }
      return {
        externalPostId: initJson.data.publish_id,
        status: "processing",
        raw: initJson as Record<string, unknown>,
      };
    }

    const initRes = await fetch(`${TIKTOK_API}/v2/post/publish/video/init/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: input.caption.slice(0, 2200),
          privacy_level: privacy,
          disable_duet: input.tiktok?.disableDuet ?? false,
          disable_comment: input.tiktok?.disableComment ?? false,
          disable_stitch: input.tiktok?.disableStitch ?? false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: media.publicUrl,
        },
      }),
    });
    const initJson = (await initRes.json()) as {
      data?: { publish_id?: string };
      error?: { code?: string; message?: string };
    };
    if (!initRes.ok || !initJson.data?.publish_id) {
      throw new SocialIntegrationError(
        initJson.error?.message || "TikTok video init failed",
        "platform_error",
        initJson.error?.message ||
          "TikTok could not start video publishing. Unaudited apps may only support private/upload flows."
      );
    }

    return {
      externalPostId: initJson.data.publish_id,
      status: "processing",
      raw: {
        ...(initJson as object),
        creator_nickname: creatorJson.data?.creator_nickname,
        post_mode: postMode,
      },
    };
  },

  async getPublishStatus(
    token: TokenBundle,
    externalPostId: string
  ): Promise<PublishStatusResult> {
    const res = await fetch(`${TIKTOK_API}/v2/post/publish/status/fetch/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({ publish_id: externalPostId }),
    });
    const json = (await res.json()) as {
      data?: { status?: string; fail_reason?: string };
      error?: { message?: string };
    };
    const status = json.data?.status;
    if (status === "PUBLISH_COMPLETE") {
      return { status: "published", externalPostId };
    }
    if (status === "FAILED") {
      return {
        status: "failed",
        externalPostId,
        errorMessage: json.data?.fail_reason || "TikTok publish failed",
      };
    }
    return { status: "processing", externalPostId };
  },
};

export function newTikTokCodeVerifier() {
  return randomBytes(32).toString("base64url");
}
