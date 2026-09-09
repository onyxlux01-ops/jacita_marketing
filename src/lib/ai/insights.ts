import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { runStructured } from "@/lib/ai/model";
import { insightsSchema, type InsightsResult } from "@/lib/ai/schemas";
import type { PerformanceSnapshot } from "@/lib/analytics/types";
import { snapshotForAi } from "@/lib/analytics/snapshot";
import { formatPercentChange } from "@/lib/analytics/date-range";

function fallbackInsights(
  ctx: BusinessContext,
  snapshot: PerformanceSnapshot | null
): InsightsResult {
  if (
    !snapshot ||
    !snapshot.dataQuality.sufficient ||
    snapshot.current.source === "none"
  ) {
    return {
      insufficient_data: true,
      summary: "Not enough data yet.",
      insights: [
        {
          text: "Not enough data yet. Publish content and collect metrics before Jacita can analyse what is working.",
          confidence: "insufficient_data",
          action_label: "Create this week's content",
          action_href: "/app/content/new?intent=week",
        },
      ],
      recommendations: [],
    };
  }

  const { current, changes, platforms, rankings, health, goalLabel } = snapshot;
  const topPlatform = platforms
    .slice()
    .sort((a, b) => b.totals.reach - a.totals.reach)[0];
  const bestType = rankings.bestContentType[0];
  const bestDay = rankings.bestDay[0];

  const insights: InsightsResult["insights"] = [
    {
      text: `Against the goal “${goalLabel}”, reach is ${current.reach.toLocaleString()} (${formatPercentChange(changes.reach)} vs prior period) with engagement rate ${current.engagement_rate ?? 0}%.`,
      confidence: snapshot.dataQuality.confidence,
      action_label: "View analytics",
      action_href: "/app/analytics",
    },
  ];

  if (topPlatform && topPlatform.totals.reach > 0) {
    insights.push({
      text: `${topPlatform.platform[0].toUpperCase()}${topPlatform.platform.slice(1)} is currently your strongest reach channel (${topPlatform.totals.reach.toLocaleString()} reach, ${topPlatform.totals.engagement_rate ?? 0}% engagement).`,
      confidence: snapshot.dataQuality.confidence,
      action_label: "Open studio",
      action_href: "/app/content/new",
    });
  }

  if (bestType) {
    insights.push({
      text: `${bestType.label} is ranking highest for your current goal among content types with enough data.`,
      confidence:
        rankings.bestContentType.length >= 2
          ? snapshot.dataQuality.confidence
          : "low",
      action_label: "Generate content",
      action_href: "/app/content/new",
    });
  }

  if (bestDay) {
    insights.push({
      text: `${bestDay.label} posts are scoring highest in this period for your goal-weighted metrics.`,
      confidence: "medium",
      action_label: "Weekly plan",
      action_href: "/app/content/new?intent=week",
    });
  }

  if (current.source === "demo" || current.source === "mixed") {
    insights.push({
      text: "These metrics include demo data, not live social API data — treat recommendations as directional.",
      confidence: "low",
      action_label: "Connect social",
      action_href: "/app/social",
    });
  }

  const recommendations: InsightsResult["recommendations"] = [];

  if (rankings.bestService[0]) {
    recommendations.push({
      title: `Promote ${rankings.bestService[0].label}`,
      explanation: `This service is leading your goal-weighted performance in the selected period.`,
      evidence: `Goal score ${rankings.bestService[0].metricValue} with ${rankings.bestService[0].secondaryValue ?? 0} bookings attributed in linked metrics.`,
      action_label: "Create campaign",
      action_href: "/app/campaigns",
      priority: "high",
      confidence: snapshot.dataQuality.confidence,
      related_service_name: rankings.bestService[0].label,
    });
  }

  if (bestType) {
    recommendations.push({
      title: `Create more ${bestType.label}`,
      explanation: `Lean into formats that are already working for ${goalLabel}, while keeping variety.`,
      evidence: `${bestType.label} ranks #1 by goal-weighted score in this period.`,
      action_label: "Generate content",
      action_href: "/app/content/new",
      priority: "medium",
      confidence: snapshot.dataQuality.confidence,
    });
  }

  if (health.mainOpportunity) {
    recommendations.push({
      title: health.mainOpportunity,
      explanation: health.explanation,
      evidence: `Marketing health ${health.score}/100 (${health.delta != null && health.delta >= 0 ? "+" : ""}${health.delta ?? "—"}).`,
      action_label: "Review analytics",
      action_href: "/app/analytics",
      priority: "medium",
      confidence: health.confidence,
    });
  }

  const topService = ctx.services.find((s) => s.is_featured) || ctx.services[0];
  if (!recommendations.length && topService) {
    recommendations.push({
      title: `Promote ${topService.name}`,
      explanation: `Catalogue lead for ${ctx.organisation.name} while more performance data accumulates.`,
      evidence: "Not enough ranked service metrics yet — using featured catalogue item.",
      action_label: "Promote a service",
      action_href: "/app/content/new?intent=promote",
      priority: "low",
      confidence: "low",
      related_service_name: topService.name,
    });
  }

  return {
    insufficient_data: false,
    summary: `Performance analysis for ${ctx.organisation.name} · ${snapshot.range.label} · goal: ${goalLabel}`,
    insights,
    recommendations,
  };
}

export async function analysePerformance(options: {
  context: BusinessContext;
  snapshot?: PerformanceSnapshot | null;
  requestText?: string | null;
}) {
  const { context: ctx, snapshot = null } = options;

  if (!snapshot || !snapshot.dataQuality.sufficient) {
    return {
      ok: true as const,
      data: fallbackInsights(ctx, snapshot),
      demo: true as const,
      model: "demo" as const,
    };
  }

  const compact = snapshotForAi(snapshot);

  return runStructured({
    schema: insightsSchema,
    system: `${JACITA_SYSTEM}

You are analysing marketing PERFORMANCE for one business only.
Rules for this task:
- Optimise for the stated business GOAL, not likes alone.
- Only make claims supported by the AGGREGATED snapshot.
- If a metric is null or missing, do not invent it.
- Never fabricate statistics or percentages.
- If evidence is thin, set confidence to low or insufficient_data.
- Every recommendation needs title, explanation, evidence, action, and priority.`,
    prompt: `${formatBusinessContextPrompt(ctx, {
      goalKey: snapshot.goalKey,
    })}

AGGREGATED PERFORMANCE SNAPSHOT (org-scoped only):
${JSON.stringify(compact, null, 2)}

USER REQUEST: ${options.requestText || "Analyse my marketing performance and recommend what to do next."}

TASK:
1. Summarise what the numbers say relative to the goal.
2. Produce short insights (supported by data only).
3. Produce actionable recommendations with evidence.
If data is insufficient or demo-only, say so clearly.`,
    fallback: () => fallbackInsights(ctx, snapshot),
  });
}
