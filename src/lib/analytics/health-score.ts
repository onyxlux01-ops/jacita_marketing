import { percentChange } from "@/lib/analytics/date-range";
import type { HealthScoreResult, MetricTotals } from "@/lib/analytics/types";
import type { MarketingGoalKey } from "@/lib/ai/goals";
import { goalMetricWeights } from "@/lib/analytics/goal-weights";

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function ratioScore(current: number, previous: number, baselineGood = 1.05) {
  if (previous <= 0) {
    return current > 0 ? 70 : 40;
  }
  const ratio = current / previous;
  if (ratio >= baselineGood * 1.2) return 95;
  if (ratio >= baselineGood) return 80;
  if (ratio >= 0.95) return 65;
  if (ratio >= 0.8) return 45;
  return 25;
}

/**
 * Transparent marketing health score from available signals.
 * Weights shift with the organisation's primary marketing goal.
 */
export function computeMarketingHealthScore(input: {
  current: MetricTotals;
  previous: MetricTotals;
  goalKey: MarketingGoalKey | null;
  contentPublished: number;
  contentTargetPerWeek?: number;
}): HealthScoreResult {
  const { current, previous, goalKey } = input;
  if (current.row_count === 0 || current.days < 3) {
    return {
      score: 0,
      previousScore: null,
      delta: null,
      components: {},
      mainImprovement: null,
      mainOpportunity: "Collect more performance data",
      explanation:
        "Not enough data yet to calculate a reliable marketing health score.",
      confidence: "insufficient_data",
    };
  }

  const weights = goalMetricWeights(goalKey);
  const weeks = Math.max(1, current.days / 7);
  const consistencyTarget = (input.contentTargetPerWeek ?? 5) * weeks;
  const consistency = clamp(
    (input.contentPublished / Math.max(consistencyTarget, 1)) * 100
  );

  const engagementScore = clamp(
    (current.engagement_rate ?? 0) * 12 +
      ratioScore(current.engagement, previous.engagement) * 0.35
  );

  const audienceScore = clamp(
    ratioScore(
      current.net_followers ?? current.profile_visits,
      previous.net_followers ?? previous.profile_visits
    )
  );

  const reachScore = clamp(
    ratioScore(current.reach, previous.reach) * 0.7 +
      Math.min(30, current.reach / 2000)
  );

  const conversionScore = clamp(
    (current.conversion_rate ?? 0) * 8 +
      ratioScore(
        current.bookings + current.enquiries,
        previous.bookings + previous.enquiries
      ) * 0.5
  );

  const goalProgress = clamp(
    ratioScore(
      current.bookings * weights.bookings +
        current.enquiries * weights.enquiries +
        current.link_clicks * weights.link_clicks +
        (current.net_followers ?? 0) * weights.followers +
        current.reach * weights.reach * 0.001,
      previous.bookings * weights.bookings +
        previous.enquiries * weights.enquiries +
        previous.link_clicks * weights.link_clicks +
        (previous.net_followers ?? 0) * weights.followers +
        previous.reach * weights.reach * 0.001
    )
  );

  // Goal-aware component weights (normalized)
  const raw = {
    consistency: { score: consistency, weight: 1, label: "Content consistency" },
    engagement: {
      score: engagementScore,
      weight: 1 + weights.engagement / 3,
      label: "Engagement",
    },
    audience: {
      score: audienceScore,
      weight: 1 + weights.followers / 3,
      label: "Audience growth",
    },
    reach: {
      score: reachScore,
      weight: 1 + weights.reach / 3,
      label: "Reach",
    },
    goal: {
      score: goalProgress,
      weight: 1.4,
      label: "Goal progress",
    },
    conversion: {
      score: conversionScore,
      weight: 1 + (weights.bookings + weights.enquiries) / 4,
      label: "Conversion performance",
    },
  };

  const weightSum = Object.values(raw).reduce((a, c) => a + c.weight, 0);
  let score = 0;
  const components: HealthScoreResult["components"] = {};
  for (const [key, c] of Object.entries(raw)) {
    const contribution = (c.score * c.weight) / weightSum;
    score += contribution;
    components[key] = {
      score: clamp(c.score),
      weight: Math.round((c.weight / weightSum) * 1000) / 1000,
      label: c.label,
      note: `${clamp(c.score)}/100`,
    };
  }

  const finalScore = clamp(score);
  const prevComposite = clamp(
    (ratioScore(previous.engagement, previous.engagement * 0.95) +
      ratioScore(previous.reach, previous.reach * 0.95) +
      55) /
      2.2
  );
  // Approximate previous score from period comparison of key signals
  const previousScore = clamp(
    (components.engagement.score +
      components.reach.score +
      components.audience.score +
      components.goal.score) /
      4 -
      (percentChange(current.reach, previous.reach) ?? 0) / 4
  );

  const ranked = Object.entries(components).sort(
    (a, b) => b[1].score - a[1].score
  );
  const weakest = Object.entries(components).sort(
    (a, b) => a[1].score - b[1].score
  )[0];

  const delta = finalScore - previousScore;
  const confidence =
    current.days >= 21 && current.row_count >= 30
      ? "high"
      : current.days >= 7
        ? "medium"
        : "low";

  return {
    score: finalScore,
    previousScore,
    delta,
    components,
    mainImprovement: ranked[0]?.[1].label ?? null,
    mainOpportunity: weakest?.[1].label
      ? `Improve ${weakest[1].label.toLowerCase()}`
      : null,
    explanation: `Score ${finalScore}/100 based on consistency, engagement, audience, reach, goal progress, and conversions — weighted for ${
      goalKey?.replaceAll("_", " ") ?? "general growth"
    }. Prior period composite ≈ ${prevComposite}.`,
    confidence,
  };
}
