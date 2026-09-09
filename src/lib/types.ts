export type ContentStatus =
  | "draft"
  | "review"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export type PlatformPublishStatus =
  | "draft"
  | "approved"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "cancelled";

export type SocialPlatform = "instagram" | "facebook" | "tiktok";

export type ConnectionStatus =
  | "connected"
  | "not_connected"
  | "expired"
  | "error";

export type CampaignStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "archived";

export type ContentRow = {
  id: string;
  organisation_id: string;
  title: string | null;
  idea: string | null;
  hook: string | null;
  caption: string | null;
  call_to_action: string | null;
  hashtags: string[];
  suggested_posting_time: string | null;
  video_concept: string | null;
  content_type: string | null;
  marketing_objective: string | null;
  tone: string | null;
  status: ContentStatus;
  scheduled_at: string | null;
  published_at: string | null;
  generation_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export const CONTENT_STATUS_FLOW: ContentStatus[] = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "publishing",
  "published",
];
