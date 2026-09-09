import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { buildFatigueSignals } from "@/lib/ai/fatigue";
import {
  goalLabel,
  mapLegacyObjective,
  type MarketingGoalKey,
} from "@/lib/ai/goals";
import { recommendMedia } from "@/lib/ai/media";
import { assessMediaList } from "@/lib/ai/media-quality";
import { runStructured } from "@/lib/ai/model";
import {
  contentBriefSchema,
  contentPackageSchema,
  type ContentPackage,
  type GeneratedContent,
} from "@/lib/ai/schemas";
import { validateContent } from "@/lib/ai/validate";
import { generateContent } from "@/lib/ai/content";

const AI_DECIDE = "__ai__";

function platformGuidance(platform: string) {
  switch (platform) {
    case "tiktok":
      return "TikTok: punchy opening hook, conversational caption, video structure, on-screen text, lighter hashtags.";
    case "facebook":
      return "Facebook: community-focused caption, natural CTA, fewer hashtags.";
    default:
      return "Instagram: visual-first hook, caption + CTA, 5–12 hashtags.";
  }
}

function fallbackBrief(
  ctx: BusinessContext,
  notes: string,
  goalKey: MarketingGoalKey
) {
  const service =
    ctx.services.find((s) =>
      notes.toLowerCase().includes(s.name.toLowerCase())
    ) ||
    ctx.services.find((s) => s.is_featured) ||
    ctx.services[0];
  return {
    goal_key: goalKey,
    product_service_name: service?.name ?? null,
    platforms: [] as Array<"instagram" | "facebook" | "tiktok">,
    content_type: null as string | null,
    tone: ctx.brand?.tone || ctx.brand?.brand_voice || "friendly",
    let_ai_decide_platforms: true,
    let_ai_decide_content_type: true,
    let_ai_decide_media: true,
    interpretation: `Create content for ${ctx.organisation.name} aimed at ${goalLabel(goalKey)}${
      service ? ` featuring ${service.name}` : ""
    }.`,
  };
}

function fallbackPackage(
  ctx: BusinessContext,
  options: {
    goalKey: MarketingGoalKey;
    platforms: Array<"instagram" | "facebook" | "tiktok">;
    contentType: string;
    tone: string;
    serviceName?: string | null;
    notes?: string | null;
    mediaIds: string[];
  }
): ContentPackage {
  const service =
    options.serviceName ||
    ctx.services.find((s) => s.is_featured)?.name ||
    ctx.services[0]?.name ||
    "your services";
  const cta = ctx.organisation.booking_url
    ? "Book now via the link in bio"
    : "Message us to enquire";
  const time = new Date(Date.now() + 1000 * 60 * 60 * 26).toISOString();

  const versions = options.platforms.map((platform) => {
    if (platform === "tiktok") {
      return {
        platform,
        hook: `Wait — this is how ${ctx.organisation.name} does ${service}.`,
        caption: `${service} worth saving for later. ${cta}`,
        call_to_action: cta,
        hashtags: ["fyp", "local", service.replace(/\s+/g, "").toLowerCase()],
        video_concept: `Open on the result, cut to process, end on brand + CTA.`,
        on_screen_text: `${service}`,
        voiceover_script: `If you've been looking for ${service}, here's what we do at ${ctx.organisation.name}.`,
        alt_text: null,
        posting_recommendation: "Post mid-evening when local audiences browse Reels/TikTok.",
        platform_notes: platformGuidance(platform),
      };
    }
    if (platform === "facebook") {
      return {
        platform,
        hook: `Looking for ${service} nearby?`,
        caption: `Hi neighbours — at ${ctx.organisation.name}${
          ctx.organisation.location ? ` in ${ctx.organisation.location}` : ""
        }, we're ready to help with ${service}.\n\n${options.notes || ""}\n\n${cta}`,
        call_to_action: cta,
        hashtags: [ctx.organisation.name.replace(/\s+/g, "")],
        video_concept: null,
        on_screen_text: null,
        voiceover_script: null,
        alt_text: `${service} at ${ctx.organisation.name}`,
        posting_recommendation: "Post late morning for local community reach.",
        platform_notes: platformGuidance(platform),
      };
    }
    return {
      platform,
      hook: `This week at ${ctx.organisation.name}: ${service}.`,
      caption: `Spotlighting ${service} for ${
        ctx.brand?.target_audience || "our community"
      }.${options.notes ? `\n\n${options.notes}` : ""}\n\n${cta}`,
      call_to_action: cta,
      hashtags: [
        ctx.organisation.name.replace(/\s+/g, "").toLowerCase().slice(0, 24),
        "local",
        "instagram",
      ],
      video_concept: options.contentType.includes("reel")
        ? `Show transformation, process, and CTA end card.`
        : null,
      on_screen_text: options.contentType.includes("reel") ? service : null,
      voiceover_script: null,
      alt_text: `${service} — ${ctx.organisation.name}`,
      posting_recommendation: "Post mid-week late afternoon.",
      platform_notes: platformGuidance(platform),
    };
  });

  return {
    core_idea: `${service} spotlight for ${goalLabel(options.goalKey)}`,
    title: `${service} · ${goalLabel(options.goalKey)}`,
    marketing_objective: goalLabel(options.goalKey),
    content_type: options.contentType,
    tone: options.tone,
    platforms: options.platforms,
    selected_service_name: service,
    recommended_media_ids: options.mediaIds,
    media_needed_message: options.mediaIds.length
      ? null
      : "Upload media for this business before scheduling visual posts.",
    media_suitability_notes: [],
    versions,
    suggested_posting_time: time,
  };
}

export async function interpretContentBrief(options: {
  context: BusinessContext;
  notes: string;
  goalKey?: string | null;
  productServiceId?: string | null;
  platform?: string | null;
  contentType?: string | null;
  tone?: string | null;
}) {
  const goalKey = mapLegacyObjective(
    options.goalKey || options.context.primaryGoalKey || "increase_brand_awareness"
  );
  const fatigue = buildFatigueSignals(options.context);

  const result = await runStructured({
    schema: contentBriefSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context, { goalKey })}

USER REQUEST (natural language):
${options.notes || "Create strong social content for this business."}

Optional overrides:
- Forced platform: ${options.platform || "none — decide"}
- Forced content type: ${options.contentType || "none — decide"}
- Forced tone: ${options.tone || "use brand"}
- Forced service id: ${options.productServiceId || "none"}

FATIGUE / DIVERSITY:
${fatigue.guidance}

Interpret the request into a brief. If platform/content type should be AI-chosen, set the let_ai_decide_* flags true and leave arrays/null accordingly.`,
    fallback: () =>
      fallbackBrief(options.context, options.notes, goalKey),
  });

  return result;
}

export async function generateContentPackage(options: {
  context: BusinessContext;
  notes?: string | null;
  goalKey?: string | null;
  productServiceId?: string | null;
  campaignId?: string | null;
  platform?: string | null; // "__ai__" or concrete
  contentType?: string | null;
  tone?: string | null;
  mediaAssetId?: string | null;
  letAiDecidePlatform?: boolean;
  letAiDecideContentType?: boolean;
  letAiDecideMedia?: boolean;
  platforms?: string[] | null;
}) {
  const notes = options.notes?.trim() || "";
  const fatigue = buildFatigueSignals(options.context);
  const letPlatform =
    options.letAiDecidePlatform ||
    !options.platform ||
    options.platform === AI_DECIDE;
  const letType =
    options.letAiDecideContentType ||
    !options.contentType ||
    options.contentType === AI_DECIDE;
  const letMedia =
    options.letAiDecideMedia !== false &&
    (!options.mediaAssetId || options.mediaAssetId === AI_DECIDE);

  const briefResult = await interpretContentBrief({
    context: options.context,
    notes,
    goalKey: options.goalKey,
    productServiceId: options.productServiceId,
    platform: letPlatform ? null : options.platform,
    contentType: letType ? null : options.contentType,
    tone: options.tone === AI_DECIDE ? null : options.tone,
  });

  if (!briefResult.ok) return briefResult;

  const brief = briefResult.data;
  const goalKey = mapLegacyObjective(brief.goal_key || options.goalKey);
  const service =
    (options.productServiceId &&
      options.context.services.find((s) => s.id === options.productServiceId)) ||
    options.context.services.find(
      (s) =>
        brief.product_service_name &&
        s.name.toLowerCase() === brief.product_service_name.toLowerCase()
    ) ||
    null;

  const platforms = (
    letPlatform
      ? brief.platforms.length
        ? brief.platforms
        : (["instagram", "tiktok", "facebook"] as const)
      : options.platforms?.length
        ? options.platforms
        : [options.platform || "instagram"]
  ).filter(Boolean) as Array<"instagram" | "facebook" | "tiktok">;

  const contentType =
    (letType ? brief.content_type : options.contentType) ||
    (platforms.includes("tiktok") ? "reel" : "image_post");
  const tone =
    (options.tone && options.tone !== AI_DECIDE
      ? options.tone
      : brief.tone) ||
    options.context.brand?.tone ||
    "friendly";

  const mediaRec = await recommendMedia({
    context: options.context,
    query: [
      service?.name,
      contentType,
      notes,
      goalLabel(goalKey),
      brief.interpretation,
    ]
      .filter(Boolean)
      .join(" "),
    contentType,
    platform: platforms[0],
  });

  const allowedIds = new Set(options.context.media.map((m) => m.id));
  let mediaIds: string[] = [];
  if (!letMedia && options.mediaAssetId && allowedIds.has(options.mediaAssetId)) {
    mediaIds = [options.mediaAssetId];
  } else if (mediaRec.ok) {
    mediaIds = mediaRec.data.recommended_media_ids.filter((id) =>
      allowedIds.has(id)
    );
  }

  const suitability = platforms.flatMap((platform) =>
    assessMediaList({
      context: options.context,
      mediaIds,
      platform,
      contentType,
    })
  );
  const suitabilityNotes = suitability.flatMap((s) =>
    s.notes.map((n) => `${s.mediaId.slice(0, 8)}…: ${n}`)
  );
  const unsuitable = suitability.filter((s) => !s.suitable);
  if (unsuitable.length && letMedia) {
    // drop unsuitable primary picks when AI chose them
    mediaIds = mediaIds.filter(
      (id) => !unsuitable.some((u) => u.mediaId === id && !u.suitable)
    );
  }

  const packageResult = await runStructured({
    schema: contentPackageSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context, {
      goalKey,
      focusServiceId: service?.id,
    })}

TASK: Create a COMPLETE multi-platform content PACKAGE (not duplicated captions).
Interpretation: ${brief.interpretation}
User notes: ${notes || "none"}
Goal: ${goalLabel(goalKey)}
Content type: ${contentType}
Tone: ${tone}
Platforms: ${platforms.join(", ")}
Service: ${service?.name || brief.product_service_name || "AI choose from catalogue"}
Recommended media IDs (org-only): ${mediaIds.join(", ") || "none"}
Media guidance: ${mediaRec.ok ? mediaRec.data.message : "n/a"}
Suitability notes: ${suitabilityNotes.join("; ") || "none"}

FATIGUE:
${fatigue.guidance}

Rules:
- Produce DISTINCT versions per platform (Instagram ≠ TikTok ≠ Facebook).
- Include package fields: title, core_idea, CTA, hashtags, posting recommendation.
- For video/reel/tiktok include video_concept, on_screen_text, voiceover_script.
- For image posts include alt_text.
- Never invent prices, awards, certifications, medical claims, testimonials, or discounts.
- Only use media IDs from the library list.
- If media is unsuitable, explain in media_suitability_notes and media_needed_message.`,
    fallback: () =>
      fallbackPackage(options.context, {
        goalKey,
        platforms,
        contentType,
        tone,
        serviceName: service?.name,
        notes,
        mediaIds,
      }),
  });

  if (!packageResult.ok) return packageResult;

  let pkg = {
    ...packageResult.data,
    recommended_media_ids: packageResult.data.recommended_media_ids.filter(
      (id) => allowedIds.has(id)
    ),
    platforms: packageResult.data.platforms.length
      ? packageResult.data.platforms
      : platforms,
  };

  if (!pkg.recommended_media_ids.length && mediaIds.length) {
    pkg.recommended_media_ids = mediaIds;
  }
  if (suitabilityNotes.length && !pkg.media_suitability_notes.length) {
    pkg.media_suitability_notes = suitabilityNotes;
  }
  if (unsuitable.length && !pkg.media_needed_message) {
    pkg.media_needed_message = unsuitable
      .map((u) => u.notes[0])
      .filter(Boolean)
      .join(" ");
  }

  // Validate primary (first) platform version as GeneratedContent
  const primary = pkg.versions[0];
  const asContent: GeneratedContent = {
    title: pkg.title,
    idea: pkg.core_idea,
    hook: primary?.hook || "",
    caption: primary?.caption || "",
    call_to_action: primary?.call_to_action || "",
    hashtags: primary?.hashtags || [],
    suggested_posting_time: pkg.suggested_posting_time,
    video_concept: primary?.video_concept,
    on_screen_text: primary?.on_screen_text,
    voiceover_script: primary?.voiceover_script,
    alt_text: primary?.alt_text,
    posting_recommendation: primary?.posting_recommendation,
    platform_notes: primary?.platform_notes,
    recommended_media_ids: pkg.recommended_media_ids,
    media_needed_message: pkg.media_needed_message,
  };

  let validation = await validateContent({
    context: options.context,
    content: asContent,
    platform: primary?.platform || platforms[0],
    contentType,
    serviceName: service?.name || pkg.selected_service_name,
    goalLabel: goalLabel(goalKey),
  });

  if (
    validation.ok &&
    (validation.data.should_regenerate || validation.data.score < 60) &&
    !packageResult.demo
  ) {
    const regenerated = await generateContent({
      context: options.context,
      platform: primary?.platform || platforms[0],
      contentType,
      goalKey,
      tone,
      productServiceId: service?.id,
      mediaAssetId: pkg.recommended_media_ids[0] || null,
      notes: `${notes}\nImprove quality. Issues: ${(validation.data.issues || []).join("; ")}`,
    });
    if (regenerated.ok && pkg.versions[0]) {
      const c = regenerated.data.content;
      pkg = {
        ...pkg,
        versions: [
          {
            ...pkg.versions[0],
            hook: c.hook,
            caption: c.caption,
            call_to_action: c.call_to_action,
            hashtags: c.hashtags,
            video_concept: c.video_concept,
            on_screen_text: c.on_screen_text,
            voiceover_script: c.voiceover_script ?? null,
            alt_text: c.alt_text ?? null,
            posting_recommendation: c.posting_recommendation ?? null,
          },
          ...pkg.versions.slice(1),
        ],
        recommended_media_ids: c.recommended_media_ids.length
          ? c.recommended_media_ids
          : pkg.recommended_media_ids,
      };
      if (regenerated.data.validation) {
        validation = regenerated.demo
          ? {
              ok: true as const,
              demo: true as const,
              model: "demo" as const,
              data: regenerated.data.validation,
            }
          : {
              ok: true as const,
              demo: false as const,
              model: regenerated.model,
              data: regenerated.data.validation,
            };
      }
    }
  }

  return {
    ...packageResult,
    data: {
      package: pkg,
      brief,
      validation: validation.ok ? validation.data : null,
      mediaRecommendation: mediaRec.ok ? mediaRec.data : null,
      selectedMediaId: pkg.recommended_media_ids[0] || null,
      goalKey,
      contentType,
      tone,
      serviceId: service?.id || null,
      fatigue,
    },
  };
}

export { AI_DECIDE };
