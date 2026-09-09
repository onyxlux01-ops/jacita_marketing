import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { runStructured } from "@/lib/ai/model";
import {
  rewriteResultSchema,
  contentVariationsSchema,
  platformVersionSchema,
} from "@/lib/ai/schemas";
import { z } from "zod";

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

const ACTION_LABELS: Record<RewriteAction, string> = {
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

export async function rewriteContent(options: {
  context: BusinessContext;
  content: {
    title?: string | null;
    hook?: string | null;
    caption?: string | null;
    call_to_action?: string | null;
    hashtags?: string[];
    video_concept?: string | null;
    on_screen_text?: string | null;
    voiceover_script?: string | null;
    alt_text?: string | null;
    content_type?: string | null;
  };
  action: RewriteAction;
  platform?: string | null;
  goalLabel?: string | null;
}) {
  const actionLabel = ACTION_LABELS[options.action] || options.action;

  return runStructured({
    schema: rewriteResultSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context)}

TASK: Rewrite social content — "${actionLabel}".
Preserve the original marketing objective: ${options.goalLabel || "as written"}.
Platform context: ${options.platform || "instagram"}

CURRENT:
${JSON.stringify(options.content, null, 2)}

Rules:
- Do not invent prices, awards, guarantees, testimonials, or services.
- Keep brand voice and terminology.
- Return improved hook, caption, CTA, hashtags (and video fields if relevant).
- Summarise what changed in change_summary.`,
    fallback: () => {
      const caption = options.content.caption || "";
      let next = caption;
      if (options.action === "make_shorter") {
        next = caption.split(/\n+/).slice(0, 3).join("\n").slice(0, 280);
      } else if (options.action === "make_more_playful") {
        next = `${caption}\n\nWho's in? 👋`.replace(/\s+👋/, " 👋");
      } else if (options.action === "improve_cta") {
        next = caption;
      }
      return {
        hook: options.content.hook || "",
        caption: next,
        call_to_action:
          options.action === "improve_cta"
            ? options.context.organisation.booking_url
              ? "Book your spot via the link in bio"
              : "Send us a message to get started"
            : options.content.call_to_action || "",
        hashtags: options.content.hashtags || [],
        video_concept: options.content.video_concept ?? null,
        on_screen_text: options.content.on_screen_text ?? null,
        voiceover_script: options.content.voiceover_script ?? null,
        change_summary: `Applied “${actionLabel}” (offline fallback).`,
      };
    },
  });
}

export async function generateVariations(options: {
  context: BusinessContext;
  content: {
    title?: string | null;
    hook?: string | null;
    caption?: string | null;
    call_to_action?: string | null;
    hashtags?: string[];
    video_concept?: string | null;
    on_screen_text?: string | null;
    voiceover_script?: string | null;
    alt_text?: string | null;
    content_type?: string | null;
  };
  platform?: string | null;
  count?: number;
}) {
  const count = Math.min(4, Math.max(2, options.count ?? 3));

  return runStructured({
    schema: contentVariationsSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context)}

TASK: Create ${count} caption/hook variations of this content.
Labels should be distinct tones such as Professional, Playful, Luxury, Short and direct.
Platform: ${options.platform || "instagram"}

BASE:
${JSON.stringify(options.content, null, 2)}

Do not invent facts. Keep the same marketing objective.`,
    fallback: () => ({
      variations: [
        {
          label: "Professional",
          tone: "professional",
          hook: options.content.hook || "",
          caption: options.content.caption || "",
          call_to_action: options.content.call_to_action || "",
          hashtags: options.content.hashtags || [],
          rationale: "Clear and polished.",
        },
        {
          label: "Playful",
          tone: "playful",
          hook: options.content.hook
            ? `${options.content.hook.replace(/\.$/, "")} ✨`
            : "A little glow-up energy…",
          caption: `${options.content.caption || ""}\n\nTag someone who needs this.`,
          call_to_action: options.content.call_to_action || "",
          hashtags: options.content.hashtags || [],
          rationale: "Lighter, more social.",
        },
        {
          label: "Short and direct",
          tone: "direct",
          hook: (options.content.hook || "").split(/[.!?]/)[0] || "Book now.",
          caption: (options.content.caption || "").slice(0, 160),
          call_to_action: options.content.call_to_action || "Message us",
          hashtags: (options.content.hashtags || []).slice(0, 4),
          rationale: "Minimal and punchy.",
        },
      ].slice(0, count),
    }),
  });
}

const repurposeSchema = z.object({
  versions: z.array(platformVersionSchema).min(1).max(3),
  summary: z.string(),
});

export async function repurposeContent(options: {
  context: BusinessContext;
  content: {
    title?: string | null;
    hook?: string | null;
    caption?: string | null;
    call_to_action?: string | null;
    hashtags?: string[];
    video_concept?: string | null;
    on_screen_text?: string | null;
    voiceover_script?: string | null;
    alt_text?: string | null;
    content_type?: string | null;
  };
  sourcePlatform?: string | null;
  targetPlatforms: Array<"instagram" | "facebook" | "tiktok">;
}) {
  return runStructured({
    schema: repurposeSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context)}

TASK: Repurpose existing content for new platforms.
Source platform: ${options.sourcePlatform || "unknown"}
Target platforms: ${options.targetPlatforms.join(", ")}
Keep the original marketing message; adapt execution (hook, structure, CTA style, hashtags).

SOURCE:
${JSON.stringify(options.content, null, 2)}

Do not invent new claims, prices, or testimonials.`,
    fallback: () => ({
      summary: "Adapted core message for target platforms.",
      versions: options.targetPlatforms.map((platform) => ({
        platform,
        hook: options.content.hook || "",
        caption:
          platform === "facebook"
            ? `Sharing this with our community:\n\n${options.content.caption || ""}`
            : platform === "tiktok"
              ? `${options.content.hook || ""}\n\n${(options.content.caption || "").slice(0, 120)}`
              : options.content.caption || "",
        call_to_action: options.content.call_to_action || "",
        hashtags:
          platform === "facebook"
            ? (options.content.hashtags || []).slice(0, 2)
            : options.content.hashtags || [],
        video_concept:
          platform === "tiktok"
            ? options.content.video_concept ||
              "Open with hook text, show process, end with CTA."
            : options.content.video_concept ?? null,
        on_screen_text:
          platform === "tiktok"
            ? options.content.on_screen_text || options.content.hook || null
            : null,
        voiceover_script:
          platform === "tiktok"
            ? options.content.voiceover_script || options.content.hook || null
            : null,
        alt_text: options.content.alt_text ?? null,
        posting_recommendation: `Best window for ${platform} based on your usual schedule.`,
        platform_notes: `Repurposed for ${platform}.`,
      })),
    }),
  });
}

export { ACTION_LABELS };
