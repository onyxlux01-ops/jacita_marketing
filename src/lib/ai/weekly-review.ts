import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { runStructured } from "@/lib/ai/model";
import {
  weeklyReviewSchema,
  type WeeklyReviewResult,
} from "@/lib/ai/schemas";
import type { PerformanceSnapshot } from "@/lib/analytics/types";
import { snapshotForAi } from "@/lib/analytics/snapshot";
import { formatPercentChange } from "@/lib/analytics/date-range";

function fallbackWeeklyReview(
  ctx: BusinessContext,
  snapshot: PerformanceSnapshot | null
): WeeklyReviewResult {
  if (!snapshot || !snapshot.dataQuality.sufficient) {
    return {
      insufficient_data: true,
      confidence: "insufficient_data",
      what_happened: "Not enough data yet for a weekly marketing review.",
      what_worked: "Not enough data yet.",
      what_didnt: "Not enough data yet.",
      what_we_learned: "Publish consistently so Jacita can identify patterns.",
      what_to_do_next:
        "Create and publish this week’s plan, then reconnect for a review.",
      recommendations: [
        {
          title: "Build a baseline week of content",
          explanation:
            "A review needs enough posts and metrics to avoid guessing.",
          evidence: "Fewer than 3 metric days available for this business.",
          action_label: "Weekly plan",
          action_href: "/app/content/new?intent=week",
          priority: "high",
        },
      ],
      content_mix_guidance: [],
    };
  }

  const topType = snapshot.rankings.bestContentType[0];
  const weakType = snapshot.rankings.bestContentType.slice(-1)[0];
  const topPlatform = snapshot.rankings.bestPlatform[0];
  const demoNote =
    snapshot.current.source === "demo" || snapshot.current.source === "mixed"
      ? " (includes demo metrics)"
      : "";

  return {
    insufficient_data: false,
    confidence: snapshot.dataQuality.confidence,
    what_happened: `This week for ${ctx.organisation.name}: reach ${snapshot.current.reach.toLocaleString()} (${formatPercentChange(snapshot.changes.reach)}), engagement rate ${snapshot.current.engagement_rate ?? 0}%, bookings ${snapshot.current.bookings}, enquiries ${snapshot.current.enquiries}${demoNote}. Goal: ${snapshot.goalLabel}.`,
    what_worked: topType
      ? `${topType.label} and ${topPlatform?.label ?? "your lead platform"} led goal-weighted performance.`
      : `${topPlatform?.label ?? "Your primary channel"} delivered the strongest reach.`,
    what_didnt: weakType
      ? `${weakType.label} lagged relative to stronger formats.`
      : "Promotional-only patterns are typically weaker than proof or education when engagement is the signal.",
    what_we_learned: `Audience response is stronger when content aligns with ${snapshot.goalLabel}. Marketing health is ${snapshot.health.score}/100.`,
    what_to_do_next: topType
      ? `Next week, increase ${topType.label} while keeping variety — do not repeat identical posts.`
      : "Next week, favour proof and educational formats tied to your primary goal.",
    recommendations: [
      {
        title: topType
          ? `Increase ${topType.label}`
          : "Increase high-performing formats",
        explanation: "Lean into formats that scored highest for your goal.",
        evidence: topType
          ? `${topType.label} goal score ${topType.metricValue}`
          : "Platform-level reach leadership",
        action_label: "Generate content",
        action_href: "/app/content/new",
        priority: "high",
      },
      {
        title: "Schedule around stronger days",
        explanation: snapshot.rankings.bestDay[0]
          ? `${snapshot.rankings.bestDay[0].label} is currently your strongest posting day.`
          : "Keep a consistent cadence while data accumulates.",
        evidence: snapshot.rankings.bestDay[0]
          ? `Best day goal score ${snapshot.rankings.bestDay[0].metricValue}`
          : "Insufficient day-level content linkage",
        action_label: "Weekly plan",
        action_href: "/app/content/new?intent=week",
        priority: "medium",
      },
    ],
    content_mix_guidance: [
      ...(topType
        ? [
            {
              content_type: topType.label,
              weight: "increase" as const,
              reason: "Highest goal-weighted score this period",
            },
          ]
        : []),
      {
        content_type: "generic promotional",
        weight: "reduce" as const,
        reason: "Usually underperforms proof and education for local businesses",
      },
      {
        content_type: "educational",
        weight: "maintain" as const,
        reason: "Supports trust and discovery without repeating the same post",
      },
    ],
  };
}

export async function generateWeeklyReview(options: {
  context: BusinessContext;
  snapshot: PerformanceSnapshot | null;
  requestText?: string | null;
}) {
  const { context: ctx, snapshot } = options;

  if (!snapshot || !snapshot.dataQuality.sufficient) {
    return {
      ok: true as const,
      data: fallbackWeeklyReview(ctx, snapshot),
      demo: true as const,
      model: "demo" as const,
    };
  }

  return runStructured({
    schema: weeklyReviewSchema,
    system: `${JACITA_SYSTEM}

You write a weekly marketing REVIEW for one business.
Sections required: what happened, what worked, what didn't, what we learned, what to do next.
Only use the aggregated snapshot. Never invent stats. Prefer the business goal over vanity metrics.`,
    prompt: `${formatBusinessContextPrompt(ctx, {
      goalKey: snapshot.goalKey,
    })}

WEEKLY SNAPSHOT:
${JSON.stringify(snapshotForAi(snapshot), null, 2)}

USER REQUEST: ${options.requestText || "Create this week's marketing review."}

Also return content_mix_guidance so next week's plan can increase what works without cloning posts.`,
    fallback: () => fallbackWeeklyReview(ctx, snapshot),
  });
}
