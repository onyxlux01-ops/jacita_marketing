import { createAdminClient } from "@/lib/supabase/admin";
import { getSocialAdapter } from "@/lib/social/registry";
import { loadAccountSecrets, saveAccountSecrets } from "@/lib/social/secrets";
import { getPublishableMediaUrl } from "@/lib/social/media-url";
import {
  SocialIntegrationError,
  userFacingSocialError,
  type PublishContentInput,
} from "@/lib/social/types";
import {
  classifyPublishError,
  type PublishErrorType,
} from "@/lib/social/errors";
import {
  isPublishingSimulationEnabled,
  wrapAdapterForSimulation,
} from "@/lib/social/simulation";
import type { SocialPlatform } from "@/lib/types";

async function resolveMedia(
  organisationId: string,
  mediaAssetId: string | null
) {
  if (!mediaAssetId) return [];
  const admin = createAdminClient();
  const { data } = await admin
    .from("media_assets")
    .select(
      "id, organisation_id, storage_path, media_type"
    )
    .eq("id", mediaAssetId)
    .eq("organisation_id", organisationId)
    .eq("is_active", true)
    .maybeSingle();
  if (!data) return [];
  const publicUrl = await getPublishableMediaUrl({
    organisationId,
    storagePath: data.storage_path,
  });
  return [
    {
      mediaType: data.media_type as "image" | "video",
      publicUrl,
      fileName: data.storage_path.split("/").pop() || null,
    },
  ];
}

export type PublishContentResult =
  | {
      success: true;
      externalPostId: string;
      externalUrl?: string | null;
      status: "published" | "publishing";
      simulated?: boolean;
    }
  | {
      error: string;
      errorType?: PublishErrorType;
      errorCode?: string;
      retryable?: boolean;
      validation?: Array<{ code: string; message: string }>;
    };

/**
 * Central publishing service.
 * Enforces same-org content + social account + membership.
 * All publishing goes through adapters — never from the browser.
 */
export async function publishContent(input: {
  contentId: string;
  socialAccountId: string;
  userId: string;
  contentPlatformId?: string | null;
  tiktokPrivacyLevel?: string | null;
  force?: boolean;
  system?: boolean;
  publishJobId?: string | null;
  simulated?: boolean;
}): Promise<PublishContentResult> {
  const admin = createAdminClient();
  const simulated =
    Boolean(input.simulated) || isPublishingSimulationEnabled();

  const { data: contentRow } = await admin
    .from("content")
    .select(
      "id, organisation_id, title, caption, hook, call_to_action, hashtags, content_type, media_asset_id, status"
    )
    .eq("id", input.contentId)
    .maybeSingle();

  if (!contentRow) {
    return {
      error: "Content not found",
      errorType: "UNKNOWN_ERROR",
      retryable: false,
    };
  }

  const { data: membership } = await admin
    .from("organisation_members")
    .select("id, role")
    .eq("organisation_id", contentRow.organisation_id)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!membership) {
    return {
      error: "Unauthorized for this business",
      errorType: "PERMISSION_ERROR",
      retryable: false,
    };
  }

  const { data: account } = await admin
    .from("social_accounts")
    .select(
      "id, organisation_id, platform, connection_status, external_account_id, metadata, health_status"
    )
    .eq("id", input.socialAccountId)
    .maybeSingle();

  if (!account) {
    return {
      error: "Social account not found",
      errorType: "BLOCKED_ACCOUNT",
      retryable: false,
    };
  }

  if (account.organisation_id !== contentRow.organisation_id) {
    return {
      error:
        "Cannot publish: content and social account belong to different businesses",
      errorType: "BLOCKED_ACCOUNT",
      retryable: false,
    };
  }

  if (
    account.connection_status !== "connected" ||
    !account.external_account_id
  ) {
    return {
      error:
        "This social account is disconnected or incomplete. Reconnect it before publishing.",
      errorType: "BLOCKED_ACCOUNT",
      retryable: false,
    };
  }

  // Idempotency: never re-post if this platform row already has an external ID
  if (input.contentPlatformId) {
    const { data: existingCp } = await admin
      .from("content_platforms")
      .select("external_post_id, publish_status")
      .eq("id", input.contentPlatformId)
      .maybeSingle();
    if (
      existingCp?.external_post_id &&
      existingCp.publish_status === "published"
    ) {
      return {
        success: true as const,
        externalPostId: existingCp.external_post_id,
        status: "published" as const,
        simulated: false,
      };
    }
  } else {
    const { data: existingCp } = await admin
      .from("content_platforms")
      .select("id, external_post_id, publish_status")
      .eq("content_id", contentRow.id)
      .eq("platform", account.platform)
      .eq("social_account_id", account.id)
      .maybeSingle();
    if (
      existingCp?.external_post_id &&
      existingCp.publish_status === "published"
    ) {
      return {
        success: true as const,
        externalPostId: existingCp.external_post_id,
        status: "published" as const,
        simulated: false,
      };
    }
  }

  const { data: org } = await admin
    .from("organisations")
    .select("autopilot_mode")
    .eq("id", contentRow.organisation_id)
    .maybeSingle();

  if (
    !input.force &&
    org?.autopilot_mode === "manual" &&
    !["approved", "scheduled", "failed", "publishing"].includes(
      contentRow.status
    )
  ) {
    return {
      error:
        "This business is in Manual mode. Approve or schedule content before publishing.",
      errorType: "MODE_BLOCKED",
      retryable: false,
    };
  }

  let adapter = getSocialAdapter(account.platform as SocialPlatform);
  if (!adapter.isConfigured()) {
    return {
      error:
        account.platform === "tiktok"
          ? "TikTok publishing requires additional developer configuration."
          : `${account.platform} publishing is not configured. Add platform credentials.`,
      errorType: "PLATFORM_ERROR",
      retryable: false,
      errorCode: "not_configured",
    };
  }

  if (simulated) {
    adapter = wrapAdapterForSimulation(adapter);
  }

  let token = await loadAccountSecrets(account.id, account.organisation_id);
  if (!token) {
    return {
      error: "Missing secure credentials for this account. Reconnect it.",
      errorType: "AUTHENTICATION_ERROR",
      retryable: false,
    };
  }

  if (
    token.expiresAt &&
    new Date(token.expiresAt).getTime() < Date.now() + 60_000
  ) {
    if (adapter.refreshToken) {
      try {
        token = await adapter.refreshToken(token);
        await saveAccountSecrets({
          socialAccountId: account.id,
          organisationId: account.organisation_id,
          token,
        });
        await admin
          .from("social_accounts")
          .update({
            connection_status: "connected",
            health_status: "healthy",
            last_error: null,
            token_expires_at: token.expiresAt || null,
          })
          .eq("id", account.id);
      } catch {
        await admin
          .from("social_accounts")
          .update({
            connection_status: "expired",
            health_status: "reauth_required",
            last_error: "Token expired",
          })
          .eq("id", account.id);
        return {
          error:
            "The social account connection expired. Reconnect the account and try again.",
          errorType: "AUTHENTICATION_ERROR",
          retryable: false,
        };
      }
    } else {
      await admin
        .from("social_accounts")
        .update({
          connection_status: "expired",
          health_status: "reauth_required",
          last_error: "Token expired",
        })
        .eq("id", account.id);
      return {
        error:
          "The social account connection expired. Reconnect the account and try again.",
        errorType: "AUTHENTICATION_ERROR",
        retryable: false,
      };
    }
  }

  const captionParts = [
    contentRow.caption || contentRow.hook || "",
    contentRow.call_to_action || "",
    (contentRow.hashtags || [])
      .map((h) => (h.startsWith("#") ? h : `#${h}`))
      .join(" "),
  ]
    .filter(Boolean)
    .join("\n\n");

  const media = await resolveMedia(
    contentRow.organisation_id,
    contentRow.media_asset_id
  );

  const publishInput: PublishContentInput = {
    organisationId: contentRow.organisation_id,
    contentId: contentRow.id,
    platform: account.platform as SocialPlatform,
    caption: captionParts,
    title: contentRow.title,
    contentType: contentRow.content_type,
    media,
    tiktok:
      account.platform === "tiktok"
        ? {
            privacyLevel:
              input.tiktokPrivacyLevel ||
              process.env.TIKTOK_DEFAULT_PRIVACY_LEVEL ||
              "SELF_ONLY",
            postMode:
              process.env.TIKTOK_DIRECT_POST_ENABLED === "true"
                ? "DIRECT_POST"
                : "MEDIA_UPLOAD",
          }
        : undefined,
  };

  const issues = adapter.validatePublish(publishInput);
  if (issues.length) {
    return {
      error: issues[0].message,
      validation: issues,
      errorType: "VALIDATION_FAILED",
      retryable: false,
      errorCode: issues[0].code,
    };
  }

  const startedAt = new Date().toISOString();
  await admin
    .from("content")
    .update({ status: "publishing" })
    .eq("id", contentRow.id)
    .eq("organisation_id", contentRow.organisation_id);

  if (input.contentPlatformId) {
    await admin
      .from("content_platforms")
      .update({
        publish_status: "publishing",
        social_account_id: account.id,
      })
      .eq("id", input.contentPlatformId);
  }

  try {
    const result = await adapter.publish(
      token,
      {
        externalAccountId: account.external_account_id,
        metadata: (account.metadata || {}) as Record<string, unknown>,
      },
      publishInput
    );

    let finalStatus: "published" | "publishing" =
      result.status === "processing" ? "publishing" : "published";
    let externalPostId = result.externalPostId;

    if (
      finalStatus === "publishing" &&
      adapter.getPublishStatus &&
      externalPostId
    ) {
      try {
        const verified = await adapter.getPublishStatus(token, externalPostId);
        if (verified.status === "published") {
          finalStatus = "published";
          externalPostId = verified.externalPostId || externalPostId;
        } else if (verified.status === "failed") {
          throw new SocialIntegrationError(
            verified.errorMessage || "Platform publish failed",
            "platform_error",
            verified.errorMessage || "Platform reported a publish failure."
          );
        }
      } catch (verifyErr) {
        if (verifyErr instanceof SocialIntegrationError) throw verifyErr;
      }
    }

    const publishedAt =
      finalStatus === "published" ? new Date().toISOString() : null;

    await admin
      .from("content")
      .update({
        status: finalStatus === "published" ? "published" : "publishing",
        published_at: publishedAt,
      })
      .eq("id", contentRow.id);

    if (input.contentPlatformId) {
      await admin
        .from("content_platforms")
        .update({
          publish_status:
            finalStatus === "published" ? "published" : "publishing",
          external_post_id: externalPostId,
          published_at: publishedAt,
          error_message: null,
          last_publish_at: new Date().toISOString(),
          social_account_id: account.id,
        })
        .eq("id", input.contentPlatformId);
    }

    await admin
      .from("social_accounts")
      .update({ health_status: "healthy", last_error: null })
      .eq("id", account.id);

    const completedAt = new Date().toISOString();
    await admin.from("social_publish_logs").insert({
      organisation_id: contentRow.organisation_id,
      content_id: contentRow.id,
      content_platform_id: input.contentPlatformId || null,
      social_account_id: account.id,
      publish_job_id: input.publishJobId || null,
      platform: account.platform,
      started_at: startedAt,
      completed_at: completedAt,
      status: finalStatus,
      external_post_id: externalPostId,
      attempt_count: 1,
      duration_ms: Date.now() - new Date(startedAt).getTime(),
      request_summary: {
        media_count: media.length,
        content_type: contentRow.content_type,
        system: Boolean(input.system),
        simulated,
      },
      response_summary: {
        external_post_id: externalPostId,
        simulated,
      },
    });

    return {
      success: true as const,
      externalPostId,
      externalUrl: null,
      status: finalStatus,
      simulated,
    };
  } catch (error) {
    const classified = classifyPublishError(error);
    const message = classified.message || userFacingSocialError(error);

    await admin
      .from("content")
      .update({ status: "failed" })
      .eq("id", contentRow.id);

    if (input.contentPlatformId) {
      await admin
        .from("content_platforms")
        .update({
          publish_status: "failed",
          error_message: message,
          social_account_id: account.id,
        })
        .eq("id", input.contentPlatformId);
    }

    if (classified.type === "AUTHENTICATION_ERROR") {
      await admin
        .from("social_accounts")
        .update({
          connection_status: "expired",
          health_status: "reauth_required",
          last_error: message,
        })
        .eq("id", account.id);
    }

    await admin.from("social_publish_logs").insert({
      organisation_id: contentRow.organisation_id,
      content_id: contentRow.id,
      content_platform_id: input.contentPlatformId || null,
      social_account_id: account.id,
      publish_job_id: input.publishJobId || null,
      platform: account.platform,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      status: "failed",
      error_message: message,
      error_type: classified.type,
      attempt_count: 1,
      duration_ms: Date.now() - new Date(startedAt).getTime(),
      request_summary: {
        code:
          error instanceof SocialIntegrationError ? error.code : "unknown",
        simulated,
      },
    });

    return {
      error: message,
      errorType: classified.type,
      errorCode: classified.code,
      retryable: classified.retryable,
    };
  }
}
