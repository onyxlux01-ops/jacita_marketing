import type { createClient } from "@/lib/supabase/server";
import { goalLabel, type MarketingGoalKey } from "@/lib/ai/goals";
import {
  aggregateMetricRows,
  emptyTotals,
  type MetricRow,
} from "@/lib/analytics/aggregate";
import {
  percentChange,
  previousPeriod,
  resolveDateRange,
} from "@/lib/analytics/date-range";
import { computeMarketingHealthScore } from "@/lib/analytics/health-score";
import { rankByGoal, rateCampaign } from "@/lib/analytics/ranking";
import type {
  CampaignPerformance,
  DateRangePreset,
  PerformanceSnapshot,
  PlatformPerformance,
} from "@/lib/analytics/types";
import type { SocialPlatform } from "@/lib/types";

type Supabase = Awaited<ReturnType<typeof createClient>>;

const METRIC_SELECT =
  "id, organisation_id, content_id, campaign_id, product_service_id, content_type, platform, metric_date, reach, impressions, likes, comments, shares, saves, profile_visits, link_clicks, bookings, enquiries, revenue_attributed, video_views, watch_time_seconds, followers_gained, followers_lost, source";

export async function buildPerformanceSnapshot(
  supabase: Supabase,
  organisationId: string,
  options?: {
    preset?: DateRangePreset;
    start?: string | null;
    end?: string | null;
    goalKey?: MarketingGoalKey | null;
  }
): Promise<PerformanceSnapshot | null> {
  const range = resolveDateRange(
    options?.preset ?? "30d",
    options?.start,
    options?.end
  );
  const comparisonRange = previousPeriod(range);

  const [
    { data: org },
    { data: currentRows },
    { data: previousRows },
    { data: content },
    { data: services },
    { data: campaigns },
    { data: contentCounts },
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select("id, primary_marketing_goal_key")
      .eq("id", organisationId)
      .maybeSingle(),
    supabase
      .from("analytics_metrics")
      .select(METRIC_SELECT)
      .eq("organisation_id", organisationId)
      .gte("metric_date", range.start)
      .lte("metric_date", range.end),
    supabase
      .from("analytics_metrics")
      .select(METRIC_SELECT)
      .eq("organisation_id", organisationId)
      .gte("metric_date", comparisonRange.start)
      .lte("metric_date", comparisonRange.end),
    supabase
      .from("content")
      .select(
        "id, title, content_type, product_service_id, campaign_id, published_at, scheduled_at, status"
      )
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("products_services")
      .select("id, name")
      .eq("organisation_id", organisationId)
      .eq("is_active", true),
    supabase
      .from("campaigns")
      .select("id, name, objective, status")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(40),
    supabase
      .from("content")
      .select("status")
      .eq("organisation_id", organisationId),
  ]);

  if (!org) return null;

  const goalKey =
    (options?.goalKey as MarketingGoalKey | null) ||
    (org.primary_marketing_goal_key as MarketingGoalKey | null) ||
    null;

  const current = aggregateMetricRows((currentRows as MetricRow[]) || []);
  const previous = aggregateMetricRows((previousRows as MetricRow[]) || []);

  const changes: Record<string, number | null> = {
    reach: percentChange(current.reach, previous.reach),
    impressions: percentChange(current.impressions, previous.impressions),
    engagement: percentChange(current.engagement, previous.engagement),
    engagement_rate: percentChange(
      current.engagement_rate,
      previous.engagement_rate
    ),
    profile_visits: percentChange(
      current.profile_visits,
      previous.profile_visits
    ),
    link_clicks: percentChange(current.link_clicks, previous.link_clicks),
    bookings: percentChange(current.bookings, previous.bookings),
    enquiries: percentChange(current.enquiries, previous.enquiries),
    revenue: percentChange(current.revenue, previous.revenue),
    net_followers: percentChange(
      current.net_followers,
      previous.net_followers
    ),
  };

  const platforms: PlatformPerformance[] = (
    ["instagram", "facebook", "tiktok"] as SocialPlatform[]
  ).map((platform) => {
    const rows = ((currentRows as Array<MetricRow & { platform: string; content_id: string | null }>) || []).filter(
      (r) => r.platform === platform
    );
    const totals = aggregateMetricRows(rows);
    const contentIds = [
      ...new Set(rows.map((r) => r.content_id).filter(Boolean)),
    ] as string[];
    let topContentTitle: string | null = null;
    let topContentId: string | null = null;
    if (contentIds.length) {
      const ranked = rankByGoal({
        rows: rows as never,
        content: (content as never) || [],
        services: (services as never) || [],
        campaigns: (campaigns as never) || [],
        goalKey,
      });
      topContentId = ranked.bestContent[0]?.id ?? null;
      topContentTitle = ranked.bestContent[0]?.label ?? null;
    } else if (totals.reach > 0) {
      topContentTitle = null;
    }
    return { platform, totals, topContentTitle, topContentId };
  });

  const rankings = rankByGoal({
    rows: ((currentRows as never) || []) as never,
    content: (content as never) || [],
    services: (services as never) || [],
    campaigns: (campaigns as never) || [],
    goalKey,
  });

  // If no content-linked metrics, still show platform top by reach day
  for (const p of platforms) {
    if (!p.topContentTitle && p.totals.reach > 0) {
      p.topContentTitle = `${p.platform} channel performance`;
    }
  }

  const campaignPerf: CampaignPerformance[] = ((campaigns as Array<{
    id: string;
    name: string;
    objective: string | null;
    status: string;
  }>) || []).map((c) => {
    const rows = (
      (currentRows as Array<
        MetricRow & { campaign_id?: string | null; content_id: string | null }
      >) || []
    ).filter((r) => {
      if (r.campaign_id === c.id) return true;
      const linked = (content as Array<{ id: string; campaign_id: string | null }> | null)?.find(
        (x) => x.id === r.content_id
      );
      return linked?.campaign_id === c.id;
    });
    const totals = aggregateMetricRows(rows);
    const published = (
      (content as Array<{ campaign_id: string | null; status: string }>) || []
    ).filter(
      (x) => x.campaign_id === c.id && x.status === "published"
    ).length;
    return {
      id: c.id,
      name: c.name,
      objective: c.objective,
      status: c.status,
      contentPublished: published,
      totals,
      rating: rateCampaign(totals, current.engagement_rate),
    };
  });

  const published = (contentCounts || []).filter(
    (c) => c.status === "published"
  ).length;
  const scheduled = (contentCounts || []).filter(
    (c) => c.status === "scheduled" || c.status === "publishing"
  ).length;
  const drafts = (contentCounts || []).filter(
    (c) => c.status === "draft" || c.status === "review"
  ).length;

  const health = computeMarketingHealthScore({
    current,
    previous,
    goalKey,
    contentPublished: published,
  });

  const notes: string[] = [];
  if (current.source === "demo" || current.source === "mixed") {
    notes.push("Some or all metrics are demo data, not live social API data.");
  }
  if (current.row_count === 0) notes.push("No metrics in this period.");
  if (
    !(currentRows || []).some(
      (r: { content_id?: string | null }) => r.content_id
    )
  ) {
    notes.push(
      "Metrics are not yet linked to individual posts — content rankings may be limited."
    );
  }

  const sufficient = current.days >= 3 && current.row_count >= 3;
  const confidence = !sufficient
    ? "insufficient_data"
    : current.days >= 21
      ? "high"
      : current.days >= 7
        ? "medium"
        : "low";

  return {
    organisationId,
    goalKey,
    goalLabel: goalLabel(goalKey),
    range,
    comparisonRange,
    current: current.row_count ? current : emptyTotals(),
    previous,
    changes,
    platforms,
    rankings,
    campaigns: campaignPerf,
    health,
    contentOutput: { published, scheduled, drafts },
    dataQuality: {
      sufficient,
      confidence,
      notes,
    },
  };
}

/** Compact AI-safe summary — never send raw row dumps. */
export function snapshotForAi(snapshot: PerformanceSnapshot) {
  return {
    goal: snapshot.goalLabel,
    goal_key: snapshot.goalKey,
    period: snapshot.range.label,
    period_start: snapshot.range.start,
    period_end: snapshot.range.end,
    data_source: snapshot.current.source,
    data_quality: snapshot.dataQuality,
    totals: {
      reach: snapshot.current.reach,
      impressions: snapshot.current.impressions,
      engagement: snapshot.current.engagement,
      engagement_rate: snapshot.current.engagement_rate,
      profile_visits: snapshot.current.profile_visits,
      link_clicks: snapshot.current.link_clicks,
      bookings: snapshot.current.bookings,
      enquiries: snapshot.current.enquiries,
      revenue: snapshot.current.revenue,
      video_views: snapshot.current.video_views,
      net_followers: snapshot.current.net_followers,
    },
    changes_vs_previous_period: snapshot.changes,
    platforms: snapshot.platforms.map((p) => ({
      platform: p.platform,
      reach: p.totals.reach,
      engagement_rate: p.totals.engagement_rate,
      profile_visits: p.totals.profile_visits,
      video_views: p.totals.video_views,
      net_followers: p.totals.net_followers,
      top_content: p.topContentTitle,
    })),
    rankings: {
      best_content: snapshot.rankings.bestContent.slice(0, 3),
      worst_content: snapshot.rankings.worstContent.slice(0, 2),
      best_content_type: snapshot.rankings.bestContentType.slice(0, 3),
      best_service: snapshot.rankings.bestService.slice(0, 3),
      best_platform: snapshot.rankings.bestPlatform,
      best_day: snapshot.rankings.bestDay.slice(0, 3),
      best_hour: snapshot.rankings.bestHour.slice(0, 3),
      best_campaign: snapshot.rankings.bestCampaign.slice(0, 3),
    },
    campaigns: snapshot.campaigns.slice(0, 5).map((c) => ({
      name: c.name,
      objective: c.objective,
      rating: c.rating,
      reach: c.totals.reach,
      engagement_rate: c.totals.engagement_rate,
      bookings: c.totals.bookings,
      enquiries: c.totals.enquiries,
    })),
    health_score: {
      score: snapshot.health.score,
      delta: snapshot.health.delta,
      main_improvement: snapshot.health.mainImprovement,
      main_opportunity: snapshot.health.mainOpportunity,
      confidence: snapshot.health.confidence,
    },
    content_output: snapshot.contentOutput,
  };
}
