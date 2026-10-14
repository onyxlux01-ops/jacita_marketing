/** Rewrite actions + labels, safe to import from client components. */

export const REWRITE_ACTIONS = [
  "make_shorter",
  "make_more_engaging",
  "make_more_professional",
  "make_more_playful",
  "make_more_persuasive",
  "improve_hook",
  "improve_cta",
  "remove_ai_sounding",
  "adapt_tiktok",
  "adapt_instagram",
  "adapt_facebook",
] as const;

export type RewriteAction = (typeof REWRITE_ACTIONS)[number];

export const ACTION_LABELS: Record<RewriteAction, string> = {
  make_shorter: "Make shorter",
  make_more_engaging: "Make more engaging",
  make_more_professional: "Make more professional",
  make_more_playful: "Make more playful",
  make_more_persuasive: "Make more persuasive",
  improve_hook: "Improve the hook",
  improve_cta: "Improve the CTA",
  remove_ai_sounding: "Remove AI-sounding language",
  adapt_tiktok: "Adapt for TikTok",
  adapt_instagram: "Adapt for Instagram",
  adapt_facebook: "Adapt for Facebook",
};
