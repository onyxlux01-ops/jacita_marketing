import type {
  CampaignStatus,
  ConnectionStatus,
  ContentStatus,
  MediaType,
  OrgRole,
  SocialPlatform,
} from "@/lib/database.types"

export const ACTIVE_ORG_COOKIE = "jacita-active-org"

export const BUSINESS_CATEGORIES = [
  "Hair & Beauty",
  "Barber",
  "Restaurant",
  "Retail",
  "Cleaning",
  "Fitness",
  "Professional Services",
  "Other",
] as const

export type BusinessCategory = (typeof BUSINESS_CATEGORIES)[number]

export const CONTENT_TYPES = [
  "image_post",
  "reel",
  "short_video",
  "educational_post",
  "promotional_post",
  "testimonial",
  "before_after",
  "behind_the_scenes",
  "product_service_spotlight",
] as const

export type ContentType = (typeof CONTENT_TYPES)[number]

export const PLATFORMS: SocialPlatform[] = [
  "instagram",
  "facebook",
  "tiktok",
]

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
}

export const CONTENT_STATUSES: ContentStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
]

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "Draft",
  review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
}

export const CAMPAIGN_STATUSES: CampaignStatus[] = [
  "draft",
  "active",
  "paused",
  "completed",
  "archived",
]

export const ORG_ROLES: OrgRole[] = ["owner", "manager", "staff"]

export const ORG_ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
}

export const CONNECTION_STATUSES: ConnectionStatus[] = [
  "connected",
  "not_connected",
  "expired",
  "error",
]

export const MEDIA_TYPES: MediaType[] = ["image", "video"]

export const AUTOPILOT_MODES = [
  "manual",
  "approval_required",
  "autopilot",
] as const
