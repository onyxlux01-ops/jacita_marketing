import { goalPerformanceScore } from "@/lib/analytics/aggregate";
import type { MetricRow } from "@/lib/analytics/aggregate";
import { aggregateMetricRows } from "@/lib/analytics/aggregate";
import { goalMetricWeights } from "@/lib/analytics/goal-weights";
import type { RankedItem } from "@/lib/analytics/types";
import type { MarketingGoalKey } from "@/lib/ai/goals";

type ContentMeta = {
  id: string;
  title: string | null;
  content_type: string | null;
  product_service_id?: string | null;
  campaign_id?: string | null;
  published_at?: string | null;
  scheduled_at?: string | null;
};

type ServiceMeta = { id: string; name: string };
type CampaignMeta = { id: string; name: string };

export function rankByGoal(input: {
  rows: Array<
    MetricRow & {
      content_id: string | null;
      platform: string;
      campaign_id?: string | null;
      product_service_id?: string | null;
      content_type?: string | null;
    }
  >;
  content: ContentMeta[];
  services: ServiceMeta[];
  campaigns: CampaignMeta[];
  goalKey: MarketingGoalKey | null;
}): {
  bestContent: RankedItem[];
  worstContent: RankedItem[];
  bestContentType: RankedItem[];
  bestService: RankedItem[];
  bestPlatform: RankedItem[];
  bestDay: RankedItem[];
  bestHour: RankedItem[];
  bestCampaign: RankedItem[];
} {
  const weights = goalMetricWeights(input.goalKey);
  const contentById = Object.fromEntries(input.content.map((c) => [c.id, c]));
  const serviceById = Object.fromEntries(input.services.map((s) => [s.id, s]));
  const campaignById = Object.fromEntries(
    input.campaigns.map((c) => [c.id, c])
  );

  // Content ranking
  const byContent = new Map<string, typeof input.rows>();
  for (const row of input.rows) {
    if (!row.content_id) continue;
    const list = byContent.get(row.content_id) || [];
    list.push(row);
    byContent.set(row.content_id, list);
  }

  const contentScores: RankedItem[] = [];
  for (const [contentId, rows] of byContent) {
    const totals = aggregateMetricRows(rows);
    const score = goalPerformanceScore(totals, weights);
    const meta = contentById[contentId];
    contentScores.push({
      id: contentId,
      label: meta?.title || "Untitled content",
      score,
      metricLabel: "goal score",
      metricValue: Math.round(score),
      secondaryLabel: "engagement",
      secondaryValue: totals.engagement,
    });
  }
  contentScores.sort((a, b) => b.score - a.score);

  // Content type
  const byType = new Map<string, typeof input.rows>();
  for (const row of input.rows) {
    const type =
      row.content_type ||
      (row.content_id && contentById[row.content_id]?.content_type) ||
      null;
    if (!type) continue;
    const list = byType.get(type) || [];
    list.push(row);
    byType.set(type, list);
  }
  const bestContentType = [...byType.entries()]
    .map(([type, rows]) => {
      const totals = aggregateMetricRows(rows);
      const score = goalPerformanceScore(totals, weights);
      return {
        id: null,
        label: type.replaceAll("_", " "),
        score,
        metricLabel: "goal score",
        metricValue: Math.round(score),
        secondaryLabel: "reach",
        secondaryValue: totals.reach,
      } satisfies RankedItem;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Service
  const byService = new Map<string, typeof input.rows>();
  for (const row of input.rows) {
    const sid =
      row.product_service_id ||
      (row.content_id && contentById[row.content_id]?.product_service_id) ||
      null;
    if (!sid) continue;
    const list = byService.get(sid) || [];
    list.push(row);
    byService.set(sid, list);
  }
  const bestService = [...byService.entries()]
    .map(([id, rows]) => {
      const totals = aggregateMetricRows(rows);
      return {
        id,
        label: serviceById[id]?.name || "Service",
        score: goalPerformanceScore(totals, weights),
        metricLabel: "goal score",
        metricValue: Math.round(goalPerformanceScore(totals, weights)),
        secondaryLabel: "bookings",
        secondaryValue: totals.bookings,
      } satisfies RankedItem;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Platform
  const byPlatform = new Map<string, typeof input.rows>();
  for (const row of input.rows) {
    const list = byPlatform.get(row.platform) || [];
    list.push(row);
    byPlatform.set(row.platform, list);
  }
  const bestPlatform = [...byPlatform.entries()]
    .map(([platform, rows]) => {
      const totals = aggregateMetricRows(rows);
      return {
        id: null,
        label: platform,
        score: goalPerformanceScore(totals, weights),
        metricLabel: "goal score",
        metricValue: Math.round(goalPerformanceScore(totals, weights)),
        secondaryLabel: "reach",
        secondaryValue: totals.reach,
      } satisfies RankedItem;
    })
    .sort((a, b) => b.score - a.score);

  // Day of week from metric_date
  const byDay = new Map<string, typeof input.rows>();
  const dayNames = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  for (const row of input.rows) {
    const d = new Date(row.metric_date + "T12:00:00");
    const name = dayNames[d.getDay()];
    const list = byDay.get(name) || [];
    list.push(row);
    byDay.set(name, list);
  }
  const bestDay = [...byDay.entries()]
    .map(([day, rows]) => {
      const totals = aggregateMetricRows(rows);
      return {
        id: null,
        label: day,
        score: goalPerformanceScore(totals, weights),
        metricLabel: "goal score",
        metricValue: Math.round(goalPerformanceScore(totals, weights)),
        secondaryLabel: "engagement",
        secondaryValue: totals.engagement,
      } satisfies RankedItem;
    })
    .sort((a, b) => b.score - a.score);

  // Hour from published_at when available
  const byHour = new Map<string, number[]>();
  for (const c of input.content) {
    const when = c.published_at || c.scheduled_at;
    if (!when || !byContent.has(c.id)) continue;
    const hour = new Date(when).getHours();
    const label = `${hour.toString().padStart(2, "0")}:00`;
    const totals = aggregateMetricRows(byContent.get(c.id)!);
    const score = goalPerformanceScore(totals, weights);
    const list = byHour.get(label) || [];
    list.push(score);
    byHour.set(label, list);
  }
  const bestHour = [...byHour.entries()]
    .map(([label, scores]) => {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return {
        id: null,
        label,
        score: avg,
        metricLabel: "avg goal score",
        metricValue: Math.round(avg),
      } satisfies RankedItem;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // Campaign
  const byCampaign = new Map<string, typeof input.rows>();
  for (const row of input.rows) {
    const cid =
      row.campaign_id ||
      (row.content_id && contentById[row.content_id]?.campaign_id) ||
      null;
    if (!cid) continue;
    const list = byCampaign.get(cid) || [];
    list.push(row);
    byCampaign.set(cid, list);
  }
  const bestCampaign = [...byCampaign.entries()]
    .map(([id, rows]) => {
      const totals = aggregateMetricRows(rows);
      return {
        id,
        label: campaignById[id]?.name || "Campaign",
        score: goalPerformanceScore(totals, weights),
        metricLabel: "goal score",
        metricValue: Math.round(goalPerformanceScore(totals, weights)),
        secondaryLabel: "reach",
        secondaryValue: totals.reach,
      } satisfies RankedItem;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  return {
    bestContent: contentScores.slice(0, 5),
    worstContent: [...contentScores].reverse().slice(0, 5),
    bestContentType,
    bestService,
    bestPlatform,
    bestDay,
    bestHour,
    bestCampaign,
  };
}

export function rateCampaign(
  totals: ReturnType<typeof aggregateMetricRows>,
  orgAverageEngagementRate: number | null
): "underperforming" | "normal" | "performing_well" | "insufficient_data" {
  if (totals.row_count < 3 || totals.impressions < 50) {
    return "insufficient_data";
  }
  const er = totals.engagement_rate ?? 0;
  const avg = orgAverageEngagementRate ?? er;
  if (er >= avg * 1.2 || totals.bookings + totals.enquiries >= 3) {
    return "performing_well";
  }
  if (er <= avg * 0.7 && totals.bookings + totals.enquiries === 0) {
    return "underperforming";
  }
  return "normal";
}
