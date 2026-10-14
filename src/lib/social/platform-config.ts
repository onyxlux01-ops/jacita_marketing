import "server-only";

import { getMetaAppCredentialsForOrg } from "@/lib/social/meta-app-credentials";
import { getSocialAdapter } from "@/lib/social/registry";
import type { SocialPlatform } from "@/lib/types";

export type PlatformConfig = {
  configured: boolean;
  /** Why it is not configured (or why the lookup failed). */
  reason?: string;
  /** Meta app that this business's Facebook/Instagram traffic uses. */
  metaAppId?: string | null;
  metaAppSource?: "org" | "env";
};

export function isMetaPlatform(platform: SocialPlatform | string) {
  return platform === "facebook" || platform === "instagram";
}

/**
 * Per-business "is this platform configured?" check. Facebook/Instagram use
 * the business's own Meta app when it has one (else the global app);
 * credential lookup errors report not-configured instead of silently
 * pretending the global app applies.
 */
export async function getPlatformConfigForOrg(
  platform: SocialPlatform,
  organisationId: string
): Promise<PlatformConfig> {
  if (!isMetaPlatform(platform)) {
    return { configured: getSocialAdapter(platform).isConfigured() };
  }
  try {
    const creds = await getMetaAppCredentialsForOrg(organisationId);
    if (!creds) {
      return {
        configured: false,
        reason:
          "No Meta app is configured for this business (and no global Meta app is set).",
      };
    }
    return { configured: true, metaAppId: creds.appId, metaAppSource: creds.source };
  } catch (e) {
    return {
      configured: false,
      reason: e instanceof Error ? e.message : "Could not load Meta app settings.",
    };
  }
}
