import type { MarketingGoalKey } from "@/lib/ai/goals";
import type { GoalMetricWeights } from "@/lib/analytics/types";

/** Goal-aware weights for ranking and health scoring (sum need not be 1). */
export function goalMetricWeights(
  goalKey: MarketingGoalKey | null | undefined
): GoalMetricWeights {
  switch (goalKey) {
    case "increase_bookings":
    case "fill_quiet_periods":
    case "promote_seasonal_offer":
      return {
        reach: 0.5,
        engagement: 0.8,
        profile_visits: 1,
        followers: 0.3,
        link_clicks: 1.5,
        enquiries: 1.8,
        bookings: 3,
        revenue: 2.5,
        video_views: 0.4,
      };
    case "increase_enquiries":
    case "increase_website_traffic":
      return {
        reach: 0.6,
        engagement: 0.9,
        profile_visits: 1.4,
        followers: 0.4,
        link_clicks: 2.2,
        enquiries: 3,
        bookings: 1.5,
        revenue: 1,
        video_views: 0.5,
      };
    case "increase_followers":
      return {
        reach: 1.4,
        engagement: 1.6,
        profile_visits: 2,
        followers: 3,
        link_clicks: 0.5,
        enquiries: 0.3,
        bookings: 0.2,
        revenue: 0.1,
        video_views: 1.2,
      };
    case "increase_engagement":
      return {
        reach: 0.8,
        engagement: 3,
        profile_visits: 1,
        followers: 0.8,
        link_clicks: 0.6,
        enquiries: 0.4,
        bookings: 0.3,
        revenue: 0.2,
        video_views: 1.5,
      };
    case "increase_brand_awareness":
      return {
        reach: 2.5,
        engagement: 1.2,
        profile_visits: 1,
        followers: 1.4,
        link_clicks: 0.5,
        enquiries: 0.3,
        bookings: 0.2,
        revenue: 0.1,
        video_views: 2,
      };
    case "promote_service":
    case "promote_new_service":
      return {
        reach: 1,
        engagement: 1.2,
        profile_visits: 1.3,
        followers: 0.5,
        link_clicks: 1.6,
        enquiries: 1.8,
        bookings: 2.2,
        revenue: 1.8,
        video_views: 1,
      };
    case "increase_repeat_customers":
      return {
        reach: 0.7,
        engagement: 1.5,
        profile_visits: 1.2,
        followers: 0.6,
        link_clicks: 1.4,
        enquiries: 1.5,
        bookings: 2.5,
        revenue: 2.2,
        video_views: 0.8,
      };
    default:
      return {
        reach: 1,
        engagement: 1.2,
        profile_visits: 1,
        followers: 1,
        link_clicks: 1.2,
        enquiries: 1.2,
        bookings: 1.5,
        revenue: 1.2,
        video_views: 1,
      };
  }
}

export function goalSuccessMetrics(goalKey: MarketingGoalKey | null | undefined) {
  const w = goalMetricWeights(goalKey);
  return Object.entries(w)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([k]) => k);
}
