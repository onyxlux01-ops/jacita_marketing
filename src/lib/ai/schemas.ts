import { z } from "zod";
import { CONTENT_TYPES, MARKETING_GOALS } from "@/lib/ai/goals";

const goalKeySchema = z.enum(
  MARKETING_GOALS.map((g) => g.key) as [
    (typeof MARKETING_GOALS)[number]["key"],
    ...(typeof MARKETING_GOALS)[number]["key"][],
  ]
);

const platformSchema = z.enum(["instagram", "facebook", "tiktok"]);
const contentTypeSchema = z.enum(
  CONTENT_TYPES as unknown as [string, ...string[]]
);

export const assistantIntentSchema = z.object({
  intent: z.enum([
    "weekly_plan",
    "promote_service",
    "grow_following",
    "get_bookings",
    "create_campaign",
    "analyse_performance",
    "create_content",
    "clarify",
  ]),
  goal_key: goalKeySchema,
  summary: z.string(),
  recommendation: z.string(),
  suggested_service_name: z.string().nullable(),
  suggested_action_label: z.string(),
  missing_information: z.array(z.string()).default([]),
});

export const strategySchema = z.object({
  title: z.string(),
  primary_objective: z.string(),
  target_audience: z.string(),
  key_message: z.string(),
  services_to_promote: z.array(z.string()).default([]),
  content_themes: z.array(z.string()).default([]),
  recommended_platforms: z.array(platformSchema).default([]),
  recommended_content_types: z.array(z.string()).default([]),
  posting_frequency: z.string(),
  campaign_duration: z.string(),
  calls_to_action: z.array(z.string()).default([]),
  content_mix: z
    .array(
      z.object({
        theme: z.string(),
        percentage: z.number(),
        rationale: z.string().optional(),
      })
    )
    .default([]),
  rationale: z.string(),
});

export const generatedContentSchema = z.object({
  title: z.string(),
  idea: z.string(),
  hook: z.string(),
  caption: z.string(),
  main_copy: z.string().optional(),
  call_to_action: z.string(),
  hashtags: z.array(z.string()).default([]),
  suggested_posting_time: z.string(),
  video_concept: z.string().nullable().optional(),
  on_screen_text: z.string().nullable().optional(),
  voiceover_script: z.string().nullable().optional(),
  alt_text: z.string().nullable().optional(),
  posting_recommendation: z.string().nullable().optional(),
  platform_notes: z.string().nullable().optional(),
  recommended_media_ids: z.array(z.string().uuid()).default([]),
  media_needed_message: z.string().nullable().optional(),
});

export const platformVersionSchema = z.object({
  platform: platformSchema,
  hook: z.string(),
  caption: z.string(),
  call_to_action: z.string(),
  hashtags: z.array(z.string()).default([]),
  video_concept: z.string().nullable().optional(),
  on_screen_text: z.string().nullable().optional(),
  voiceover_script: z.string().nullable().optional(),
  alt_text: z.string().nullable().optional(),
  posting_recommendation: z.string().nullable().optional(),
  platform_notes: z.string().nullable().optional(),
});

export const contentPackageSchema = z.object({
  core_idea: z.string(),
  title: z.string(),
  marketing_objective: z.string(),
  content_type: z.string(),
  tone: z.string(),
  platforms: z.array(platformSchema).min(1).max(3),
  selected_service_name: z.string().nullable().optional(),
  recommended_media_ids: z.array(z.string().uuid()).default([]),
  media_needed_message: z.string().nullable().optional(),
  media_suitability_notes: z.array(z.string()).default([]),
  versions: z.array(platformVersionSchema).min(1).max(3),
  suggested_posting_time: z.string(),
});

export const contentBriefSchema = z.object({
  goal_key: goalKeySchema,
  product_service_name: z.string().nullable(),
  platforms: z.array(platformSchema).default([]),
  content_type: z.string().nullable(),
  tone: z.string().nullable(),
  let_ai_decide_platforms: z.boolean().default(false),
  let_ai_decide_content_type: z.boolean().default(false),
  let_ai_decide_media: z.boolean().default(true),
  interpretation: z.string(),
});

export const contentVariationSchema = z.object({
  label: z.string(),
  tone: z.string(),
  hook: z.string(),
  caption: z.string(),
  call_to_action: z.string(),
  hashtags: z.array(z.string()).default([]),
  rationale: z.string().optional(),
});

export const contentVariationsSchema = z.object({
  variations: z.array(contentVariationSchema).min(2).max(4),
});

export const rewriteResultSchema = z.object({
  hook: z.string(),
  caption: z.string(),
  call_to_action: z.string(),
  hashtags: z.array(z.string()).default([]),
  video_concept: z.string().nullable().optional(),
  on_screen_text: z.string().nullable().optional(),
  voiceover_script: z.string().nullable().optional(),
  change_summary: z.string(),
});

export const contentValidationSchema = z.object({
  passed: z.boolean(),
  score: z.number().min(0).max(100),
  issues: z.array(z.string()).default([]),
  flags: z.array(z.string()).default([]),
  summary: z.string(),
  should_regenerate: z.boolean().default(false),
  brand_alignment: z.number().min(0).max(100).optional(),
  objective_fit: z.number().min(0).max(100).optional(),
  hook_strength: z.number().min(0).max(100).optional(),
  cta_quality: z.number().min(0).max(100).optional(),
  platform_suitability: z.number().min(0).max(100).optional(),
  originality: z.number().min(0).max(100).optional(),
  media_suitability: z.number().min(0).max(100).optional(),
  factuality_ok: z.boolean().default(true),
});

export const mediaRecommendSchema = z.object({
  recommended_media_ids: z.array(z.string().uuid()).default([]),
  reasons: z.array(z.string()).default([]),
  needs_new_media: z.boolean(),
  message: z.string(),
  suitability: z
    .array(
      z.object({
        media_id: z.string().uuid(),
        suitable: z.boolean(),
        notes: z.string(),
      })
    )
    .default([]),
});

export const weeklyPlanItemSchema = z.object({
  day: z.enum([
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ]),
  platform: platformSchema,
  content_type: z.string(),
  theme: z.string(),
  title: z.string(),
  hook: z.string(),
  caption: z.string(),
  call_to_action: z.string(),
  hashtags: z.array(z.string()).default([]),
  suggested_posting_time: z.string(),
  video_concept: z.string().nullable().optional(),
  product_service_name: z.string().nullable().optional(),
  recommended_media_ids: z.array(z.string().uuid()).default([]),
});

export const weeklyPlanSchema = z.object({
  plan_title: z.string(),
  goal_summary: z.string(),
  strategy_summary: z.string(),
  items: z.array(weeklyPlanItemSchema).min(5).max(14),
});

export const campaignPlanSchema = z.object({
  name: z.string(),
  objective: z.string(),
  target_audience: z.string(),
  key_message: z.string(),
  services_products: z.array(z.string()).default([]),
  content_themes: z.array(z.string()).default([]),
  platform_recommendations: z.array(platformSchema).default([]),
  call_to_action: z.string(),
  campaign_duration_days: z.number().int().min(3).max(60),
  start_offset_days: z.number().int().min(0).max(14).default(0),
  budget_suggestion: z.string().nullable().optional(),
  content_items: z
    .array(
      z.object({
        day_offset: z.number().int().min(0).max(60),
        platform: platformSchema,
        content_type: z.string(),
        title: z.string(),
        hook: z.string(),
        caption: z.string(),
        call_to_action: z.string(),
        hashtags: z.array(z.string()).default([]),
        suggested_posting_time: z.string(),
        video_concept: z.string().nullable().optional(),
        product_service_name: z.string().nullable().optional(),
        recommended_media_ids: z.array(z.string().uuid()).default([]),
      })
    )
    .min(3)
    .max(14),
});

export const insightsSchema = z.object({
  insufficient_data: z.boolean(),
  summary: z.string(),
  insights: z
    .array(
      z.object({
        text: z.string(),
        confidence: z.enum(["low", "medium", "high", "insufficient_data"]),
        action_label: z.string().nullable().optional(),
        action_href: z.string().nullable().optional(),
      })
    )
    .default([]),
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string(),
        evidence: z.string(),
        action_label: z.string(),
        action_href: z.string(),
        priority: z.enum(["high", "medium", "low"]),
        confidence: z.enum(["low", "medium", "high", "insufficient_data"]),
        related_service_name: z.string().nullable().optional(),
        related_content_title: z.string().nullable().optional(),
        related_campaign_name: z.string().nullable().optional(),
      })
    )
    .default([]),
});

export const weeklyReviewSchema = z.object({
  insufficient_data: z.boolean(),
  confidence: z.enum(["low", "medium", "high", "insufficient_data"]),
  what_happened: z.string(),
  what_worked: z.string(),
  what_didnt: z.string(),
  what_we_learned: z.string(),
  what_to_do_next: z.string(),
  recommendations: z
    .array(
      z.object({
        title: z.string(),
        explanation: z.string(),
        evidence: z.string(),
        action_label: z.string(),
        action_href: z.string(),
        priority: z.enum(["high", "medium", "low"]),
      })
    )
    .default([]),
  content_mix_guidance: z
    .array(
      z.object({
        content_type: z.string(),
        weight: z.enum(["increase", "maintain", "reduce"]),
        reason: z.string(),
      })
    )
    .default([]),
});

export type AssistantIntent = z.infer<typeof assistantIntentSchema>;
export type StrategyResult = z.infer<typeof strategySchema>;
export type GeneratedContent = z.infer<typeof generatedContentSchema>;
export type ContentPackage = z.infer<typeof contentPackageSchema>;
export type ContentBrief = z.infer<typeof contentBriefSchema>;
export type ContentVariations = z.infer<typeof contentVariationsSchema>;
export type RewriteResult = z.infer<typeof rewriteResultSchema>;
export type PlatformVersion = z.infer<typeof platformVersionSchema>;
export type ContentValidation = z.infer<typeof contentValidationSchema>;
export type WeeklyPlan = z.infer<typeof weeklyPlanSchema>;
export type CampaignPlan = z.infer<typeof campaignPlanSchema>;
export type MediaRecommend = z.infer<typeof mediaRecommendSchema>;
export type InsightsResult = z.infer<typeof insightsSchema>;
export type WeeklyReviewResult = z.infer<typeof weeklyReviewSchema>;

export { goalKeySchema, platformSchema, contentTypeSchema };
