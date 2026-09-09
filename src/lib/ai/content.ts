import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { goalLabel, mapLegacyObjective, type MarketingGoalKey } from "@/lib/ai/goals";
import { recommendMedia } from "@/lib/ai/media";
import { runStructured } from "@/lib/ai/model";
import {
  generatedContentSchema,
  type GeneratedContent,
} from "@/lib/ai/schemas";
import { validateContent } from "@/lib/ai/validate";

function platformGuidance(platform: string) {
  switch (platform) {
    case "tiktok":
      return `TikTok: strong opening hook in first line, shorter conversational caption, include video_concept and on_screen_text, lighter hashtag set.`;
    case "facebook":
      return `Facebook: conversational and community-focused, fewer hashtags, clear CTA in natural language.`;
    default:
      return `Instagram: visual-first, strong hook, caption with CTA, relevant hashtags (5–12).`;
  }
}

function fallbackContent(
  ctx: BusinessContext,
  options: {
    platform: string;
    contentType: string;
    goalKey: MarketingGoalKey;
    serviceName?: string | null;
    notes?: string | null;
  }
): GeneratedContent {
  const service =
    options.serviceName ||
    ctx.services.find((s) => s.is_featured)?.name ||
    ctx.services[0]?.name ||
    "your services";
  const cta = ctx.organisation.booking_url
    ? "Book now via the link in bio"
    : ctx.organisation.website
      ? "Visit our website to enquire"
      : "Message us to book";

  const hook =
    options.platform === "tiktok"
      ? `Wait — this is how ${ctx.organisation.name} does ${service}.`
      : `This week at ${ctx.organisation.name}: ${service}.`;

  return {
    title: `${service} · ${goalLabel(options.goalKey)}`,
    idea: `Platform-native ${options.contentType} promoting ${service} for ${goalLabel(options.goalKey)}.`,
    hook,
    caption:
      options.platform === "facebook"
        ? `Hi neighbours — at ${ctx.organisation.name}${
            ctx.organisation.location ? ` in ${ctx.organisation.location}` : ""
          }, we're focusing on ${service}.\n\n${
            options.notes ? `${options.notes}\n\n` : ""
          }If you've been meaning to enquire, this is your nudge.\n\n${cta}`
        : `${hook}\n\n${
            ctx.brand?.brand_voice ? `${ctx.brand.brand_voice}\n\n` : ""
          }Spotlighting ${service} for ${
            ctx.brand?.target_audience || "our community"
          }.${options.notes ? `\n\n${options.notes}` : ""}\n\n${cta}`,
    main_copy: `Promote ${service} with proof-led storytelling for ${ctx.organisation.name}.`,
    call_to_action: cta,
    hashtags: [
      ctx.organisation.name.replace(/\s+/g, "").toLowerCase().slice(0, 24),
      (ctx.organisation.business_category || "localbusiness")
        .replace(/\s+/g, "")
        .toLowerCase(),
      options.platform,
      "local",
    ].filter(Boolean),
    suggested_posting_time: new Date(
      Date.now() + 1000 * 60 * 60 * 26
    ).toISOString(),
    video_concept:
      options.contentType.includes("reel") ||
      options.contentType.includes("video") ||
      options.platform === "tiktok"
        ? `Open on the result or product, cut to process, end on ${ctx.organisation.name} + CTA.`
        : null,
    on_screen_text:
      options.platform === "tiktok" ? `${service} at ${ctx.organisation.name}` : null,
    platform_notes: platformGuidance(options.platform),
    recommended_media_ids: [],
    media_needed_message: ctx.media.length
      ? null
      : "Upload media for this business before scheduling visual posts.",
  };
}

export async function generateContent(options: {
  context: BusinessContext;
  platform: string;
  contentType: string;
  goalKey?: string | null;
  tone?: string | null;
  isPromotion?: boolean;
  productServiceId?: string | null;
  mediaAssetId?: string | null;
  notes?: string | null;
  strategySummary?: string | null;
}) {
  const goalKey = mapLegacyObjective(options.goalKey);
  const service = options.productServiceId
    ? options.context.services.find((s) => s.id === options.productServiceId)
    : null;

  const mediaRec = await recommendMedia({
    context: options.context,
    query: [
      service?.name,
      options.contentType,
      options.notes,
      goalLabel(goalKey),
    ]
      .filter(Boolean)
      .join(" "),
    contentType: options.contentType,
    platform: options.platform,
  });

  const allowedIds = new Set(options.context.media.map((m) => m.id));
  const selectedMediaId =
    options.mediaAssetId && allowedIds.has(options.mediaAssetId)
      ? options.mediaAssetId
      : mediaRec.ok
        ? mediaRec.data.recommended_media_ids[0] ?? null
        : null;

  const result = await runStructured({
    schema: generatedContentSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context, {
      goalKey,
      focusServiceId: options.productServiceId,
    })}

TASK: Generate ONE platform-specific content piece as JSON.
Platform: ${options.platform}
${platformGuidance(options.platform)}
Content type: ${options.contentType}
Goal: ${goalLabel(goalKey)}
Tone override: ${options.tone || "use brand tone"}
Promotion: ${options.isPromotion ? "yes" : "no"}
Notes: ${options.notes || "none"}
Strategy notes: ${options.strategySummary || "none"}
Suggested media IDs from library: ${
      mediaRec.ok ? mediaRec.data.recommended_media_ids.join(", ") || "none" : "none"
    }
Media guidance: ${mediaRec.ok ? mediaRec.data.message : "n/a"}

Rules:
- Write specifically for ${options.platform} (do not write a generic caption for all platforms).
- Only include recommended_media_ids that exist in the library list.
- If no suitable media exists, set media_needed_message clearly.
- suggested_posting_time must be a realistic future ISO timestamp.`,
    fallback: () =>
      fallbackContent(options.context, {
        platform: options.platform,
        contentType: options.contentType,
        goalKey,
        serviceName: service?.name,
        notes: options.notes,
      }),
  });

  if (!result.ok) return result;

  let content = {
    ...result.data,
    recommended_media_ids: result.data.recommended_media_ids.filter((id) =>
      allowedIds.has(id)
    ),
  };

  if (
    selectedMediaId &&
    !content.recommended_media_ids.includes(selectedMediaId)
  ) {
    content.recommended_media_ids = [
      selectedMediaId,
      ...content.recommended_media_ids,
    ];
  }

  if (
    !content.recommended_media_ids.length &&
    mediaRec.ok &&
    mediaRec.data.needs_new_media
  ) {
    content.media_needed_message =
      content.media_needed_message || mediaRec.data.message;
  }

  let validation = await validateContent({
    context: options.context,
    content,
    platform: options.platform,
    contentType: options.contentType,
    serviceName: service?.name,
    goalLabel: goalLabel(goalKey),
  });

  if (
    validation.ok &&
    validation.data.should_regenerate &&
    !result.demo
  ) {
    const regenerated = await runStructured({
      schema: generatedContentSchema,
      system: JACITA_SYSTEM,
      prompt: `${formatBusinessContextPrompt(options.context, {
        goalKey,
        focusServiceId: options.productServiceId,
      })}

Previous draft failed validation:
${validation.data.issues.join("; ")}
${validation.data.flags.join("; ")}

Regenerate improved ${options.platform} content for type ${options.contentType}.
Goal: ${goalLabel(goalKey)}
Notes: ${options.notes || "none"}`,
      fallback: () => content,
    });
    if (regenerated.ok) {
      content = {
        ...regenerated.data,
        recommended_media_ids: regenerated.data.recommended_media_ids.filter(
          (id) => allowedIds.has(id)
        ),
      };
      validation = await validateContent({
        context: options.context,
        content,
        platform: options.platform,
        contentType: options.contentType,
        serviceName: service?.name,
        goalLabel: goalLabel(goalKey),
      });
    }
  }

  return {
    ...result,
    data: {
      content,
      validation: validation.ok ? validation.data : null,
      mediaRecommendation: mediaRec.ok ? mediaRec.data : null,
      selectedMediaId,
      goalKey,
    },
  };
}
