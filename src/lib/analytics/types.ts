import type { MarketingGoalKey } from "@/lib/ai/goals";
import type { SocialPlatform } from "@/lib/types";

export type DateRangePreset = "7d" | "30d" | "90d" | "custom";

export type DateRange = {
  start: string; // YYYY-MM-DD
  end: string;
  preset: DateRangePreset;
  label: string;
};

export type MetricTotals = {
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  profile_visits: number;
  link_clicks: number;
  bookings: number;
  enquiries: number;
  revenue: number;
  video_views: number | null;
  watch_time_seconds: number | null;
  followers_gained: number | null;
  followers_lost: number | null;
  engagement: number;
  engagement_rate: number | null;
  click_through_rate: number | null;
  conversion_rate: number | null;
  net_followers: number | null;
  days: number;
  row_count: number;
  source: "demo" | "live" | "mixed" | "none";
};

export type PlatformPerformance = {
  platform: SocialPlatform;
  totals: MetricTotals;
  topContentTitle: string | null;
  topContentId: string | null;
};

export type RankedItem = {
  id: string | null;
  label: string;
  score: number;
  metricLabel: string;
  metricValue: number;
  secondaryLabel?: string;
  secondaryValue?: number | null;
};

export type CampaignPerformance = {
  id: string;
  name: string;
  objective: string | null;
  status: string;
  contentPublished: number;
  totals: MetricTotals;
  rating: "underperforming" | "normal" | "performing_well" | "insufficient_data";
};

export type HealthScoreResult = {
  score: number;
  previousScore: number | null;
  delta: number | null;
  components: Record<
    string,
    { score: number; weight: number; label: string; note: string }
  >;
  mainImprovement: string | null;
  mainOpportunity: string | null;
  explanation: string;
  confidence: "low" | "medium" | "high" | "insufficient_data";
};

export type PerformanceSnapshot = {
  organisationId: string;
  goalKey: MarketingGoalKey | null;
  goalLabel: string;
  range: DateRange;
  comparisonRange: DateRange;
  current: MetricTotals;
  previous: MetricTotals;
  changes: Record<string, number | null>;
  platforms: PlatformPerformance[];
  rankings: {
    bestContent: RankedItem[];
    worstContent: RankedItem[];
    bestContentType: RankedItem[];
    bestService: RankedItem[];
    bestPlatform: RankedItem[];
    bestDay: RankedItem[];
    bestHour: RankedItem[];
    bestCampaign: RankedItem[];
  };
  campaigns: CampaignPerformance[];
  health: HealthScoreResult;
  contentOutput: {
    published: number;
    scheduled: number;
    drafts: number;
  };
  dataQuality: {
    sufficient: boolean;
    confidence: "low" | "medium" | "high" | "insufficient_data";
    notes: string[];
  };
};

export type GoalMetricWeights = {
  reach: number;
  engagement: number;
  profile_visits: number;
  followers: number;
  link_clicks: number;
  enquiries: number;
  bookings: number;
  revenue: number;
  video_views: number;
};
