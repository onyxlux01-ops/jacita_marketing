import {
  getMetaAppCredentials,
  metaFetch,
  metaGraphBase,
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

const FACEBOOK_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_posts",
  "pages_manage_metadata",
  "business_management",
  // Ads foundation — requires Meta App Review for production
  "ads_read",
  "ads_management",
].join(",");

export const facebookAdapter: SocialPlatformAdapter = {
  platform: "facebook",

  isConfigured() {
    return Boolean(getMetaAppCredentials());
  },

  getAuthorizationUrl({ state, redirectUri }) {
    const creds = getMetaAppCredentials();
    if (!creds) {
      throw new SocialIntegrationError(
        "Meta app not configured",
        "not_configured",
        "Facebook connection is not configured yet. Add META_APP_ID and META_APP_SECRET."
      );
    }
    return metaOAuthDialogUrl({
      client_id: creds.appId,
      redirect_uri: redirectUri,
      state,
      response_type: "code",
      scope: FACEBOOK_SCOPES,
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

    const tokenRes = await metaFetch<{
      access_token: string;
      token_type?: string;
      expires_in?: number;
    }>("/oauth/access_token", {
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
      token_type?: string;
    }>("/oauth/access_token", {
      searchParams: {
        grant_type: "fb_exchange_token",
        client_id: creds.appId,
        client_secret: creds.appSecret,
        fb_exchange_token: tokenRes.access_token,
      },
    });

    const pages = await metaFetch<{
      data?: Array<{
        id: string;
        name: string;
        access_token: string;
        picture?: { data?: { url?: string } };
      }>;
    }>("/me/accounts", {
      searchParams: {
        access_token: longLived.access_token,
        fields: "id,name,access_token,picture{url}",
      },
    });

    const page = pages.data?.[0];
    if (!page) {
      throw new SocialIntegrationError(
        "No Facebook Pages available",
        "oauth_failed",
        "No Facebook Page was found for this login. Create or get access to a Page, then try again."
      );
    }

    // Persist granted scopes (not merely requested) so ads_read detection is accurate
    let grantedScopes = FACEBOOK_SCOPES.split(",");
    try {
      const perms = await metaFetch<{
        data?: Array<{ permission?: string; status?: string }>;
      }>("/me/permissions", {
        searchParams: { access_token: longLived.access_token },
      });
      const granted = (perms.data || [])
        .filter((p) => p.status === "granted" && p.permission)
        .map((p) => p.permission as string);
      if (granted.length) grantedScopes = granted;
    } catch {
      // Fall back to requested scopes if permissions endpoint fails
    }

    const expiresAt = longLived.expires_in
      ? new Date(Date.now() + longLived.expires_in * 1000).toISOString()
      : null;

    return {
      externalAccountId: page.id,
      accountName: page.name,
      accountHandle: page.name,
      profileImageUrl: page.picture?.data?.url ?? null,
      scopes: grantedScopes,
      metadata: {
        page_id: page.id,
        available_pages: (pages.data || []).map((p) => ({
          id: p.id,
          name: p.name,
        })),
        graph_version: process.env.META_GRAPH_API_VERSION || "v22.0",
      },
      token: {
        accessToken: longLived.access_token,
        pageAccessToken: page.access_token,
        expiresAt,
        tokenType: longLived.token_type || "bearer",
      },
    } satisfies ConnectedAccountInfo;
  },

  validatePublish(input: PublishContentInput): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    if (!input.caption?.trim() && input.media.length === 0) {
      issues.push({
        code: "empty",
        message: "Facebook posts need a caption or media.",
      });
    }
    if (input.caption.length > 63206) {
      issues.push({
        code: "caption_length",
        message: "Facebook caption exceeds the maximum length.",
      });
    }
    for (const media of input.media) {
      if (media.mediaType === "image") {
        if (media.mimeType && !/^image\/(jpeg|jpg|png|gif|bmp|webp)$/i.test(media.mimeType)) {
          issues.push({
            code: "image_format",
            message: "This image format is not suitable for Facebook.",
          });
        }
        if (media.byteSize && media.byteSize > 10 * 1024 * 1024) {
          issues.push({
            code: "image_size",
            message: "Facebook image uploads should be under 10MB.",
          });
        }
      }
      if (media.mediaType === "video") {
        if (media.mimeType && !/video\/(mp4|quicktime)/i.test(media.mimeType)) {
          issues.push({
            code: "video_format",
            message: "This video is not suitable for Facebook because the file format is unsupported.",
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
    const pageToken = token.pageAccessToken || token.accessToken;
    const pageId = account.externalAccountId;
    const image = input.media.find((m) => m.mediaType === "image");
    const video = input.media.find((m) => m.mediaType === "video");

    if (video) {
      const published = await metaFetch<{ id?: string }>(`/${pageId}/videos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token: pageToken,
          file_url: video.publicUrl,
          description: input.caption,
          title: input.title || undefined,
        }),
      });
      if (!published.id) {
        throw new SocialIntegrationError(
          "Facebook video publish returned no id",
          "platform_error"
        );
      }
      return { externalPostId: published.id, status: "published" };
    }

    if (image) {
      const published = await metaFetch<{ id?: string; post_id?: string }>(
        `/${pageId}/photos`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            access_token: pageToken,
            url: image.publicUrl,
            caption: input.caption,
          }),
        }
      );
      const id = published.post_id || published.id;
      if (!id) {
        throw new SocialIntegrationError(
          "Facebook photo publish returned no id",
          "platform_error"
        );
      }
      return { externalPostId: id, status: "published" };
    }

    const published = await metaFetch<{ id?: string }>(`/${pageId}/feed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: pageToken,
        message: input.caption,
      }),
    });
    if (!published.id) {
      throw new SocialIntegrationError(
        "Facebook feed publish returned no id",
        "platform_error"
      );
    }
    return { externalPostId: published.id, status: "published" };
  },

  async getPublishStatus(token, externalPostId) {
    const pageToken = token.pageAccessToken || token.accessToken;
    try {
      const post = await metaFetch<{
        id?: string;
        is_published?: boolean;
        status_type?: string;
      }>(`/${externalPostId}`, {
        searchParams: {
          access_token: pageToken,
          fields: "id,is_published,status_type",
        },
      });
      if (!post.id) {
        return {
          status: "failed",
          externalPostId,
          errorMessage: "Facebook post not found after publish.",
        };
      }
      return {
        status: "published",
        externalPostId: post.id,
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
      // Ambiguous (timeout / transient) — treat as processing so retries can verify
      return {
        status: "processing",
        externalPostId,
        errorMessage: msg,
      };
    }
  },
};

void metaGraphBase;
