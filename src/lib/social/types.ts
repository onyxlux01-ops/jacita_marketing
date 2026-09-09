import type { SocialPlatform } from "@/lib/types";

export type ConnectionStatus =
  | "connected"
  | "not_connected"
  | "expired"
  | "error";

export type TokenBundle = {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  /** Facebook Page token when distinct from user token */
  pageAccessToken?: string | null;
  raw?: Record<string, unknown>;
};

export type ConnectedAccountInfo = {
  externalAccountId: string;
  accountName: string | null;
  accountHandle: string | null;
  profileImageUrl: string | null;
  scopes: string[];
  metadata?: Record<string, unknown>;
  token: TokenBundle;
};

export type PublishMediaInput = {
  mediaType: "image" | "video";
  /** Publicly reachable URL for platforms that pull media */
  publicUrl: string;
  mimeType?: string | null;
  fileName?: string | null;
  byteSize?: number | null;
};

export type PublishContentInput = {
  organisationId: string;
  contentId: string;
  platform: SocialPlatform;
  caption: string;
  title?: string | null;
  contentType?: string | null;
  media: PublishMediaInput[];
  /** TikTok-specific options chosen by user */
  tiktok?: {
    privacyLevel: string;
    disableComment?: boolean;
    disableDuet?: boolean;
    disableStitch?: boolean;
    postMode?: "DIRECT_POST" | "MEDIA_UPLOAD";
  };
};

export type PublishResult = {
  externalPostId: string;
  status: "published" | "processing";
  raw?: Record<string, unknown>;
};

export type PublishStatusResult = {
  status: "published" | "processing" | "failed";
  externalPostId?: string | null;
  errorMessage?: string | null;
};

export type ValidationIssue = {
  code: string;
  message: string;
};

export interface SocialPlatformAdapter {
  platform: SocialPlatform;
  isConfigured(): boolean;
  getAuthorizationUrl(input: {
    state: string;
    redirectUri: string;
    codeVerifier?: string;
  }): string;
  exchangeCode(input: {
    code: string;
    redirectUri: string;
    codeVerifier?: string;
  }): Promise<ConnectedAccountInfo>;
  refreshToken?(token: TokenBundle): Promise<TokenBundle>;
  getAccount?(token: TokenBundle): Promise<Partial<ConnectedAccountInfo>>;
  disconnect?(token: TokenBundle): Promise<void>;
  validatePublish(input: PublishContentInput): ValidationIssue[];
  publish(
    token: TokenBundle,
    account: { externalAccountId: string; metadata?: Record<string, unknown> },
    input: PublishContentInput
  ): Promise<PublishResult>;
  getPublishStatus?(
    token: TokenBundle,
    externalPostId: string
  ): Promise<PublishStatusResult>;
}

export class SocialIntegrationError extends Error {
  constructor(
    message: string,
    public code:
      | "not_configured"
      | "oauth_failed"
      | "token_expired"
      | "permission_revoked"
      | "validation"
      | "rate_limited"
      | "platform_error"
      | "network"
      | "unsupported",
    public userMessage?: string
  ) {
    super(message);
    this.name = "SocialIntegrationError";
  }
}

export function userFacingSocialError(error: unknown): string {
  if (error instanceof SocialIntegrationError) {
    return error.userMessage || error.message;
  }
  if (error instanceof Error) {
    if (/token|oauth|190/i.test(error.message)) {
      return "The social account connection expired or was revoked. Reconnect the account and try again.";
    }
    if (/rate|throttle|80001/i.test(error.message)) {
      return "The platform is rate-limiting requests. Try again in a few minutes.";
    }
  }
  return "Publishing failed due to a platform error. Check the account connection and media, then retry.";
}
