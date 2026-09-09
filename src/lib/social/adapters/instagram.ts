import {
  getMetaAppCredentials,
  metaFetch,
  metaOAuthDialogUrl,
} from "@/lib/social/meta-client";
import type {
  ConnectedAccountInfo,
  PublishContentInput,
  PublishResult,
  SocialPlatformAdapter,
  TokenBundle,
  ValidationIssue,
} from "@/lib/social/types";
import { SocialIntegrationError } from "@/lib/social/types";

/**
 * Instagram Content Publishing via Facebook Login + linked IG Business account.
 * Official flow: Page access token → IG user id → media container → media_publish.
 * Uses graph.facebook.com (Instagram API with Facebook Login).
 */
const INSTAGRAM_SCOPES = [
  "instagram_basic",
  "instagram_content_publish",
  "pages_show_list",
  "pages_read_engagement",
  "business_management",
].join(",");

export const instagramAdapter: SocialPlatformAdapter = {
  platform: "instagram",

  isConfigured() {
    return Boolean(getMetaAppCredentials());
  },

  getAuthorizationUrl({ state, redirectUri }) {
    const creds = getMetaAppCredentials();
    if (!creds) {
      throw new SocialIntegrationError(
        "Meta app not configured",
        "not_configured",
        "Instagram connection is not configured yet. Add META_APP_ID and META_APP_SECRET."
      );
    }
    return metaOAuthDialogUrl({
      client_id: creds.appId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: INSTAGRAM_SCOPES,
    });
  },

  async exchangeCode({ code, redirectUri }) {
    const creds = getMetaAppCredentials();
    if (!creds) {
      throw new SocialIntegrationError(
        "Meta app not configured",
        "not_configured"
      );
    }

    const short = await metaFetch<{ access_token: string }>("/oauth/access_token", {
      searchParams: {
        client_id: creds.appId,
        client_secret: creds.appSecret,
        redirect_uri: redirectUri,
        code,
      },
    });

    const longLived = await metaFetch<{
      access_token: string;
      expires_in?: number;
    }>("/oauth/access_token", {
      searchParams: {
        grant_type: "fb_exchange_token",
        client_id: creds.appId,
        client_secret: creds.appSecret,
        fb_exchange_token: short.access_token,
      },
    });

    const pages = await metaFetch<{
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        instagram_business_account?: { id: string };
      }>;
    }>("/me/accounts", {
      searchParams: {
        access_token: longLived.access_token,
        fields: "id,name,access_token,instagram_business_account",
      },
    });

    const pageWithIg = (pages.data || []).find(
      (p) => p.instagram_business_account?.id
    );
    if (!pageWithIg?.instagram_business_account?.id) {
      throw new SocialIntegrationError(
        "No Instagram Business account linked",
        "oauth_failed",
        "No Instagram Business/Creator account linked to a Facebook Page was found. Link Instagram to a Page in Meta Business Suite, then reconnect."
      );
    }

    const igUserId = pageWithIg.instagram_business_account.id;
    const igProfile = await metaFetch<{
      id: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
    }>(`/${igUserId}`, {
      searchParams: {
        access_token: pageWithIg.access_token,
        fields: "id,username,name,profile_picture_url",
      },
    });

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    return {
      externalAccountId: igUserId,
      accountName: igProfile.name || pageWithIg.name,
      accountHandle: igProfile.username
        ? `@${igProfile.username}`
        : igProfile.name || null,
      profileImageUrl: igProfile.profile_picture_url ?? null,
      scopes: INSTAGRAM_SCOPES.split(","),
      metadata: {
        ig_user_id: igUserId,
        page_id: pageWithIg.id,
        username: igProfile.username || null,
      },
      token: {
        accessToken: longLived.access_token,
        pageAccessToken: pageWithIg.access_token,
        expiresAt,
        tokenType: "bearer",
      },
    } satisfies ConnectedAccountInfo;
  },

  validatePublish(input: PublishContentInput): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!input.media.length) {
      issues.push({
        code: "media_required",
        message: "Instagram publishing requires an image or video from the media library.",
      });
    }
    if (input.caption.length > 2200) {
      issues.push({
        code: "caption_length",
        message: "Instagram captions must be 2,200 characters or fewer.",
      });
    }
    for (const media of input.media) {
      if (media.mediaType === "image") {
        if (media.mimeType && !/^image\/(jpeg|jpg|png)$/i.test(media.mimeType)) {
          issues.push({
            code: "image_format",
            message: "Instagram images should be JPEG or PNG.",
          });
        }
        if (media.byteSize && media.byteSize > 8 * 1024 * 1024) {
          issues.push({
            code: "image_size",
            message: "Instagram image file size is too large (max ~8MB).",
          });
        }
      }
      if (media.mediaType === "video") {
        if (media.mimeType && !/video\/(mp4|quicktime)/i.test(media.mimeType)) {
          issues.push({
            code: "video_format",
            message:
              "This video is not suitable for Instagram because the file format is unsupported.",
          });
        }
      }
    }
    return issues;
  },

  async publish(
    token: TokenBundle,
    account: { externalAccountId: string },
    input: PublishContentInput
  ): Promise<PublishResult> {
    const accessToken = token.pageAccessToken || token.accessToken;
    const igUserId = account.externalAccountId;
    const media = input.media[0];
    if (!media) {
      throw new SocialIntegrationError("Media required", "validation");
    }

    const containerBody: Record<string, string> = {
      access_token: accessToken,
      caption: input.caption,
    };

    if (media.mediaType === "video") {
      containerBody.media_type = "REELS";
      containerBody.video_url = media.publicUrl;
      containerBody.share_to_feed = "true";
    } else {
      containerBody.image_url = media.publicUrl;
    }

    const container = await metaFetch<{ id?: string }>(`/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(containerBody),
    });

    if (!container.id) {
      throw new SocialIntegrationError(
        "Instagram container creation failed",
        "platform_error"
      );
    }

    // Poll container readiness — do not publish until FINISHED/PUBLISHED
    let ready = false;
    for (let i = 0; i < 30; i++) {
      const status = await metaFetch<{
        status_code?: string;
        status?: string;
      }>(`/${container.id}`, {
        searchParams: {
          access_token: accessToken,
          fields: "status_code,status",
        },
      });
      if (
        status.status_code === "FINISHED" ||
        status.status_code === "PUBLISHED"
      ) {
        ready = true;
        break;
      }
      if (status.status_code === "ERROR") {
        throw new SocialIntegrationError(
          "Instagram media processing failed",
          "platform_error",
          "Instagram could not process this media. Check the file and try again."
        );
      }
      await new Promise((r) => setTimeout(r, 2000));
    }

    if (!ready) {
      throw new SocialIntegrationError(
        "Instagram media container not ready",
        "platform_error",
        "Instagram is still processing this media. Retry shortly."
      );
    }

    const published = await metaFetch<{ id?: string }>(
      `/${igUserId}/media_publish`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: accessToken,
          creation_id: container.id,
        }),
      }
    );

    if (!published.id) {
      throw new SocialIntegrationError(
        "Instagram publish returned no id",
        "platform_error"
      );
    }

    return { externalPostId: published.id, status: "published" };
  },

  async getPublishStatus(token, externalPostId) {
    const accessToken = token.pageAccessToken || token.accessToken;
    try {
      const media = await metaFetch<{
        id?: string;
        permalink?: string;
        media_type?: string;
      }>(`/${externalPostId}`, {
        searchParams: {
          access_token: accessToken,
          fields: "id,permalink,media_type",
        },
      });
      if (!media.id) {
        return {
          status: "failed",
          externalPostId,
          errorMessage: "Instagram media not found after publish.",
        };
      }
      return {
        status: "published",
        externalPostId: media.id,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/does not exist|404|Object does not exist/i.test(msg)) {
        return {
          status: "failed",
          externalPostId,
          errorMessage: msg,
        };
      }
      return {
        status: "processing",
        externalPostId,
        errorMessage: msg,
      };
    }
  },
};
