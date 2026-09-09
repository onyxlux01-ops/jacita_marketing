export const MARKETING_GOALS = [
  {
    key: "increase_bookings",
    label: "Increase bookings",
    description: "Drive more appointment or reservation bookings.",
  },
  {
    key: "promote_service",
    label: "Promote a service",
    description: "Spotlight a specific product or service.",
  },
  {
    key: "increase_followers",
    label: "Increase social media followers",
    description: "Grow audience on social channels.",
  },
  {
    key: "increase_engagement",
    label: "Increase engagement",
    description: "Earn more likes, comments, saves, and shares.",
  },
  {
    key: "increase_brand_awareness",
    label: "Increase brand awareness",
    description: "Make the business more recognisable locally.",
  },
  {
    key: "promote_new_service",
    label: "Promote a new service",
    description: "Launch and explain a new offering.",
  },
  {
    key: "fill_quiet_periods",
    label: "Fill quiet appointment periods",
    description: "Fill quieter days or timeslots.",
  },
  {
    key: "promote_seasonal_offer",
    label: "Promote a seasonal offer",
    description: "Push a limited-time or seasonal promotion.",
  },
  {
    key: "increase_website_traffic",
    label: "Increase website traffic",
    description: "Send more people to the website.",
  },
  {
    key: "increase_enquiries",
    label: "Increase enquiries",
    description: "Encourage DMs, form fills, and calls.",
  },
  {
    key: "increase_repeat_customers",
    label: "Increase repeat customers",
    description: "Bring existing customers back.",
  },
] as const;

export type MarketingGoalKey = (typeof MARKETING_GOALS)[number]["key"];

export const CONTENT_TYPES = [
  "image_post",
  "carousel",
  "reel",
  "short_video",
  "educational",
  "promotional",
  "testimonial",
  "before_after",
  "behind_the_scenes",
  "service_spotlight",
  "product_spotlight",
  "community",
  "seasonal",
] as const;

export type AiContentType = (typeof CONTENT_TYPES)[number];

export function goalLabel(key: string | null | undefined) {
  return MARKETING_GOALS.find((g) => g.key === key)?.label ?? key ?? "Marketing goal";
}

export function mapLegacyObjective(value: string | null | undefined): MarketingGoalKey {
  switch (value) {
    case "bookings":
      return "increase_bookings";
    case "engagement":
      return "increase_engagement";
    case "promotion":
      return "promote_service";
    case "education":
      return "increase_engagement";
    case "awareness":
      return "increase_brand_awareness";
    case "growth":
    case "followers":
      return "increase_followers";
    default:
      if (MARKETING_GOALS.some((g) => g.key === value)) {
        return value as MarketingGoalKey;
      }
      return "increase_brand_awareness";
  }
}
