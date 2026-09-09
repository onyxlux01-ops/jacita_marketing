/**
 * Development-only publishing simulation.
 * Impossible in production: requires PUBLISHING_SIMULATION=true AND non-production NODE_ENV.
 */
import type {
  PublishContentInput,
  PublishResult,
  PublishStatusResult,
  SocialPlatformAdapter,
  TokenBundle,
  ValidationIssue,
} from "@/lib/social/types";
import { SocialIntegrationError } from "@/lib/social/types";

export function isPublishingSimulationEnabled() {
  if (process.env.NODE_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  return process.env.PUBLISHING_SIMULATION === "true";
}

export type SimulationScenario =
  | "success"
  | "temporary_failure"
  | "permanent_failure"
  | "timeout"
  | "rate_limit";

export function getSimulationScenario(): SimulationScenario {
  const raw = (process.env.PUBLISHING_SIMULATION_SCENARIO || "success").toLowerCase();
  if (
    raw === "temporary_failure" ||
    raw === "permanent_failure" ||
    raw === "timeout" ||
    raw === "rate_limit"
  ) {
    return raw;
  }
  return "success";
}

export function wrapAdapterForSimulation(
  adapter: SocialPlatformAdapter
): SocialPlatformAdapter {
  if (!isPublishingSimulationEnabled()) return adapter;

  const scenario = getSimulationScenario();

  return {
    ...adapter,
    validatePublish(input: PublishContentInput): ValidationIssue[] {
      return adapter.validatePublish(input);
    },
    async publish(
      _token: TokenBundle,
      account: { externalAccountId: string; metadata?: Record<string, unknown> },
      input: PublishContentInput
    ): Promise<PublishResult> {
      if (scenario === "timeout") {
        throw new SocialIntegrationError(
          "Simulated network timeout",
          "network",
          "Simulated timeout — no real API call was made."
        );
      }
      if (scenario === "rate_limit") {
        throw new SocialIntegrationError(
          "Simulated rate limit",
          "rate_limited",
          "Simulated rate limit — no real API call was made."
        );
      }
      if (scenario === "temporary_failure") {
        throw new SocialIntegrationError(
          "Simulated temporary platform error",
          "platform_error",
          "Simulated temporary failure — no real API call was made."
        );
      }
      if (scenario === "permanent_failure") {
        throw new SocialIntegrationError(
          "Simulated permanent failure",
          "permission_revoked",
          "Simulated permanent failure — no real API call was made."
        );
      }

      const id = `sim_${input.platform}_${Date.now()}_${account.externalAccountId.slice(0, 6)}`;
      return {
        externalPostId: id,
        status: "published",
        raw: {
          simulated: true,
          scenario,
          caption_preview: input.caption.slice(0, 80),
        },
      };
    },
    async getPublishStatus(
      _token: TokenBundle,
      externalPostId: string
    ): Promise<PublishStatusResult> {
      if (externalPostId.startsWith("sim_")) {
        return { status: "published", externalPostId };
      }
      return (
        adapter.getPublishStatus?.(_token, externalPostId) ?? {
          status: "published",
          externalPostId,
        }
      );
    },
  };
}
