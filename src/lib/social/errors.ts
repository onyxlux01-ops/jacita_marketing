import { createHash } from "crypto";
import { SocialIntegrationError } from "@/lib/social/types";

/** Standard publishing error categories */
export type PublishErrorType =
  | "AUTHENTICATION_ERROR"
  | "PERMISSION_ERROR"
  | "RATE_LIMIT"
  | "INVALID_MEDIA"
  | "INVALID_CONTENT"
  | "VALIDATION_FAILED"
  | "PLATFORM_ERROR"
  | "NETWORK_ERROR"
  | "AMBIGUOUS_TIMEOUT"
  | "BLOCKED_ACCOUNT"
  | "STALE_CONTENT"
  | "DUPLICATE_GUARD"
  | "AUTOMATION_PAUSED"
  | "MODE_BLOCKED"
  | "MISSED_SCHEDULE"
  | "UNKNOWN_ERROR";

export type ClassifiedError = {
  type: PublishErrorType;
  retryable: boolean;
  message: string;
  code?: string;
};

export function classifyPublishError(error: unknown): ClassifiedError {
  if (error instanceof SocialIntegrationError) {
    switch (error.code) {
      case "token_expired":
      case "oauth_failed":
        return {
          type: "AUTHENTICATION_ERROR",
          retryable: false,
          message:
            error.userMessage ||
            "Account authorization required. Reconnect the social account.",
          code: error.code,
        };
      case "permission_revoked":
        return {
          type: "PERMISSION_ERROR",
          retryable: false,
          message:
            error.userMessage ||
            "Missing publishing permission for this account.",
          code: error.code,
        };
      case "rate_limited":
        return {
          type: "RATE_LIMIT",
          retryable: true,
          message:
            error.userMessage ||
            "Temporary platform limit. Publishing will retry later.",
          code: error.code,
        };
      case "validation":
        return {
          type: "VALIDATION_FAILED",
          retryable: false,
          message: error.userMessage || error.message,
          code: error.code,
        };
      case "network":
        return {
          type: "NETWORK_ERROR",
          retryable: true,
          message:
            "Network issue while contacting the platform. Will verify before retrying.",
          code: error.code,
        };
      case "unsupported":
      case "not_configured":
        return {
          type: "PLATFORM_ERROR",
          retryable: false,
          message:
            error.userMessage ||
            "This platform requires additional developer configuration.",
          code: error.code,
        };
      default:
        return {
          type: "PLATFORM_ERROR",
          retryable: true,
          message: error.userMessage || error.message,
          code: error.code,
        };
    }
  }

  const msg = error instanceof Error ? error.message : String(error);
  if (/timeout|ETIMEDOUT|ECONNRESET|fetch failed|network/i.test(msg)) {
    return {
      type: "NETWORK_ERROR",
      retryable: true,
      message:
        "The platform did not respond in time. We will verify before retrying to avoid duplicates.",
    };
  }
  if (/rate|throttle|429|80001/i.test(msg)) {
    return {
      type: "RATE_LIMIT",
      retryable: true,
      message: "Temporary platform limit. Publishing will retry later.",
    };
  }
  if (/token|oauth|190|401|unauthorized|expired/i.test(msg)) {
    return {
      type: "AUTHENTICATION_ERROR",
      retryable: false,
      message: "Account authorization required. Reconnect the social account.",
    };
  }
  if (/permission|403|scope/i.test(msg)) {
    return {
      type: "PERMISSION_ERROR",
      retryable: false,
      message: "Missing publishing permission for this account.",
    };
  }
  if (/media|image|video|format|dimension|duration/i.test(msg)) {
    return {
      type: "INVALID_MEDIA",
      retryable: false,
      message: msg.slice(0, 280),
    };
  }

  return {
    type: "UNKNOWN_ERROR",
    retryable: true,
    message: "Publishing failed due to a platform error. Will retry safely.",
  };
}

export function humanPublishMessage(input: {
  platform: string;
  success?: boolean;
  errorType?: PublishErrorType | null;
  message?: string | null;
  simulated?: boolean;
}) {
  const platform =
    input.platform.charAt(0).toUpperCase() + input.platform.slice(1);
  const sim = input.simulated ? " (simulation)" : "";

  if (input.success) {
    return `${platform} post published successfully${sim}.`;
  }

  switch (input.errorType) {
    case "RATE_LIMIT":
      return `${platform} temporarily rejected the request. AI will retry${sim}.`;
    case "NETWORK_ERROR":
      return `${platform} connection timed out. Verifying before any retry${sim}.`;
    case "AMBIGUOUS_TIMEOUT":
      return `${platform} timed out after a possible publish. Check the platform before retrying — duplicate blocked until verified${sim}.`;
    case "AUTHENTICATION_ERROR":
      return `${platform} connection requires reauthorization.`;
    case "PERMISSION_ERROR":
      return `${platform} is missing publishing permission.`;
    case "INVALID_MEDIA":
      return `${platform} rejected the media. Update the media and retry.`;
    case "INVALID_CONTENT":
    case "VALIDATION_FAILED":
      return `${platform} validation failed: ${input.message || "fix content before publishing."}`;
    case "BLOCKED_ACCOUNT":
      return `${platform} is disconnected. Reconnect to resume publishing.`;
    case "STALE_CONTENT":
      return `Content changed after scheduling. Re-approve to publish the latest version.`;
    case "AUTOMATION_PAUSED":
      return `Publishing held — automation is paused.`;
    case "MODE_BLOCKED":
      return `Publishing blocked by the current automation mode.`;
    case "MISSED_SCHEDULE":
      return `Scheduled time was missed. ${input.message || "Rescheduled or skipped."}`;
    case "DUPLICATE_GUARD":
      return `${platform} post was already published — duplicate blocked.`;
    default:
      return (
        input.message ||
        `${platform} publishing failed. Check the account and try again.`
      );
  }
}

/** Delay before next retry (ms) — attempt is 1-based after failure */
export function retryDelayMs(attemptCount: number): number {
  if (attemptCount <= 1) return 60_000; // 1 min
  if (attemptCount === 2) return 5 * 60_000; // 5 min
  if (attemptCount === 3) return 30 * 60_000; // 30 min
  return 2 * 60 * 60_000; // 2 hours final
}

export function hashContentVersion(input: {
  title?: string | null;
  hook?: string | null;
  caption?: string | null;
  call_to_action?: string | null;
  hashtags?: string[] | null;
  media_asset_id?: string | null;
  content_type?: string | null;
}) {
  const raw = JSON.stringify({
    title: input.title || "",
    hook: input.hook || "",
    caption: input.caption || "",
    call_to_action: input.call_to_action || "",
    hashtags: input.hashtags || [],
    media_asset_id: input.media_asset_id || "",
    content_type: input.content_type || "",
  });
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

export function buildIdempotencyKey(input: {
  organisationId: string;
  contentId: string;
  socialAccountId: string;
  versionHash: string;
}) {
  return createHash("sha256")
    .update(
      `${input.organisationId}:${input.contentId}:${input.socialAccountId}:${input.versionHash}`
    )
    .digest("hex")
    .slice(0, 40);
}
