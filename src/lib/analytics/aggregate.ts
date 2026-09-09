import type { MetricTotals } from "@/lib/analytics/types";

export type MetricRow = {
  reach: number | null;
  impressions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  profile_visits: number | null;
  link_clicks: number | null;
  bookings: number | null;
  enquiries: number | null;
  revenue_attributed: number | string | null;
  video_views: number | null;
  watch_time_seconds: number | string | null;
  followers_gained: number | null;
  followers_lost: number | null;
  source: string | null;
  metric_date: string;
};

function sumNullable(
  rows: MetricRow[],
  pick: (r: MetricRow) => number | null | undefined
): number | null {
  let any = false;
  let total = 0;
  for (const row of rows) {
    const v = pick(row);
    if (v == null) continue;
    any = true;
    total += Number(v);
  }
  return any ? total : null;
}

export function emptyTotals(): MetricTotals {
  return {
    reach: 0,
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    profile_visits: 0,
    link_clicks: 0,
    bookings: 0,
    enquiries: 0,
    revenue: 0,
    video_views: null,
    watch_time_seconds: null,
    followers_gained: null,
    followers_lost: null,
    engagement: 0,
    engagement_rate: null,
    click_through_rate: null,
    conversion_rate: null,
    net_followers: null,
    days: 0,
    row_count: 0,
    source: "none",
  };
}

export function aggregateMetricRows(rows: MetricRow[]): MetricTotals {
  if (!rows.length) return emptyTotals();

  const reach = rows.reduce((a, r) => a + (r.reach ?? 0), 0);
  const impressions = rows.reduce((a, r) => a + (r.impressions ?? 0), 0);
  const likes = rows.reduce((a, r) => a + (r.likes ?? 0), 0);
  const comments = rows.reduce((a, r) => a + (r.comments ?? 0), 0);
  const shares = rows.reduce((a, r) => a + (r.shares ?? 0), 0);
  const saves = rows.reduce((a, r) => a + (r.saves ?? 0), 0);
  const profile_visits = rows.reduce((a, r) => a + (r.profile_visits ?? 0), 0);
  const link_clicks = rows.reduce((a, r) => a + (r.link_clicks ?? 0), 0);
  const bookings = rows.reduce((a, r) => a + (r.bookings ?? 0), 0);
  const enquiries = rows.reduce((a, r) => a + (r.enquiries ?? 0), 0);
  const revenue = rows.reduce(
    (a, r) => a + Number(r.revenue_attributed ?? 0),
    0
  );

  const video_views = sumNullable(rows, (r) => r.video_views);
  const watch_time_seconds = sumNullable(rows, (r) =>
    r.watch_time_seconds == null ? null : Number(r.watch_time_seconds)
  );
  const followers_gained = sumNullable(rows, (r) => r.followers_gained);
  const followers_lost = sumNullable(rows, (r) => r.followers_lost);

  const engagement = likes + comments + shares + saves;
  const engagement_rate =
    impressions > 0
      ? Math.round((engagement / impressions) * 1000) / 10
      : null;
  const click_through_rate =
    impressions > 0
      ? Math.round((link_clicks / impressions) * 1000) / 10
      : null;
  const conversion_rate =
    link_clicks > 0
      ? Math.round(((bookings + enquiries) / link_clicks) * 1000) / 10
      : null;
  const net_followers =
    followers_gained == null && followers_lost == null
      ? null
      : (followers_gained ?? 0) - (followers_lost ?? 0);

  const hasLive = rows.some((r) => r.source === "live");
  const hasDemo = rows.some((r) => r.source === "demo");
  const source: MetricTotals["source"] = hasLive && hasDemo
    ? "mixed"
    : hasLive
      ? "live"
      : hasDemo
        ? "demo"
        : "none";

  return {
    reach,
    impressions,
    likes,
    comments,
    shares,
    saves,
    profile_visits,
    link_clicks,
    bookings,
    enquiries,
    revenue: Math.round(revenue * 100) / 100,
    video_views,
    watch_time_seconds:
      watch_time_seconds == null
        ? null
        : Math.round(watch_time_seconds * 10) / 10,
    followers_gained,
    followers_lost,
    engagement,
    engagement_rate,
    click_through_rate,
    conversion_rate,
    net_followers,
    days: new Set(rows.map((r) => r.metric_date)).size,
    row_count: rows.length,
    source,
  };
}

export function goalPerformanceScore(
  totals: MetricTotals,
  weights: Record<string, number>
): number {
  const engagements = totals.engagement;
  const values: Record<string, number> = {
    reach: totals.reach,
    engagement: engagements,
    profile_visits: totals.profile_visits,
    followers: totals.net_followers ?? 0,
    link_clicks: totals.link_clicks,
    enquiries: totals.enquiries,
    bookings: totals.bookings,
    revenue: totals.revenue,
    video_views: totals.video_views ?? 0,
  };

  let score = 0;
  for (const [key, weight] of Object.entries(weights)) {
    score += (values[key] ?? 0) * weight;
  }
  return score;
}
