import { generateImage } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import {
  FLYER_FORMATS,
  type FlyerFormatId,
  type FlyerMediaMode,
} from "@/lib/ai/flyer-shared";
import {
  classifyOpenAiError,
  hasOpenAIKey,
  runStructured,
} from "@/lib/ai/model";

export {
  FLYER_FORMATS,
  FLYER_MEDIA_MODES,
  type FlyerFormatId,
  type FlyerMediaMode,
} from "@/lib/ai/flyer-shared";

export const flyerBriefSchema = z.object({
  headline: z.string(),
  subheadline: z.string(),
  cta: z.string(),
  visual_direction: z.string(),
  style_notes: z.string(),
  colour_guidance: z.string(),
  image_prompt: z.string(),
  /** When true, the image model should incorporate library photos as the subject. */
  use_uploaded_media: z.boolean(),
  /** Up to 2 media asset IDs from the business library (images only). */
  reference_media_ids: z.array(z.string()).max(2).default([]),
});

export type FlyerBrief = z.infer<typeof flyerBriefSchema>;

function formatSize(id: FlyerFormatId) {
  return FLYER_FORMATS.find((f) => f.id === id)?.size ?? "1024x1024";
}

/** Images suitable as flyer photo references (skip AI-generated flyers / videos). */
export function libraryImageCandidates(ctx: BusinessContext) {
  return ctx.media.filter((m) => {
    if (m.media_type !== "image") return false;
    if (!m.storage_path) return false;
    const tags = (m.tags || []).map((t) => t.toLowerCase());
    if (tags.includes("ai-generated") || tags.includes("flyer")) return false;
    return true;
  });
}

function fallbackBrief(
  ctx: BusinessContext,
  notes: string,
  format: FlyerFormatId,
  mediaMode: FlyerMediaMode
): FlyerBrief {
  const service =
    ctx.services.find((s) => s.is_featured) || ctx.services[0];
  const name = ctx.organisation.name;
  const offer = service?.name || notes || "our services";
  const primary = ctx.brand?.primary_color || "#0f1218";
  const secondary = ctx.brand?.secondary_color || "#f4f5f6";
  const candidates = libraryImageCandidates(ctx);
  const preferLibrary =
    mediaMode === "library" ||
    (mediaMode === "auto" &&
      candidates.length > 0 &&
      (/photo|picture|media|our (work|team|salon|shop)|before|after|real/i.test(
        notes
      ) ||
        // ~half the time when library photos exist
        Math.random() < 0.55));

  const refs = preferLibrary
    ? candidates
        .slice()
        .sort((a, b) => Number(b.is_favourite) - Number(a.is_favourite))
        .slice(0, 2)
        .map((m) => m.id)
    : [];

  return {
    headline: service ? service.name : `Discover ${name}`,
    subheadline: notes?.trim() || `Professional ${offer} from ${name}`,
    cta: ctx.organisation.booking_url ? "Book now" : "Enquire today",
    visual_direction: refs.length
      ? "Build a premium flyer that features the attached business photo(s) as the hero subject, with clean marketing typography overlaid."
      : "Clean premium marketing flyer with clear hierarchy, generous whitespace, and a single focal photo-style scene.",
    style_notes:
      "Modern British small-business look — polished, calm, not neon or cluttered. Readable headline, short supporting line, one CTA.",
    colour_guidance: `Use brand colours near ${primary} and ${secondary} with strong contrast for text.`,
    image_prompt: [
      `Design a polished promotional flyer graphic for "${name}".`,
      `Format: ${format}.`,
      refs.length
        ? "Use the attached reference photo(s) as the main visual — keep the real business subject recognisable; do not replace them with unrelated stock scenes."
        : "Invent a fitting atmospheric scene for this business.",
      `Headline text on the flyer: "${service ? service.name : name}".`,
      `Supporting line: "${notes?.trim() || `Quality ${offer}`}".`,
      `CTA badge: "${ctx.organisation.booking_url ? "Book now" : "Enquire today"}".`,
      `Brand colours around ${primary} and ${secondary}.`,
      "Soft studio lighting, high-end print quality, safe margins, sharp legible text, no watermarks.",
    ].join(" "),
    use_uploaded_media: refs.length > 0,
    reference_media_ids: refs,
  };
}

export async function generateFlyerBrief(options: {
  context: BusinessContext;
  notes?: string | null;
  format: FlyerFormatId;
  productServiceId?: string | null;
  mediaMode?: FlyerMediaMode;
}) {
  const { context: ctx, format } = options;
  const mediaMode = options.mediaMode ?? "auto";
  const notes = options.notes?.trim() || "";
  const focus = options.productServiceId
    ? ctx.services.find((s) => s.id === options.productServiceId)
    : null;
  const candidates = libraryImageCandidates(ctx);
  const mediaCatalog = candidates
    .slice(0, 24)
    .map(
      (m) =>
        `- ${m.id} · ${m.description || "untitled"}${m.category ? ` · ${m.category}` : ""}${
          m.is_favourite ? " · favourite" : ""
        }`
    )
    .join("\n");

  const allowedIds = new Set(candidates.map((m) => m.id));
  const notesForFallback = focus
    ? `${notes} Feature ${focus.name}`.trim()
    : notes;

  const fallback = () =>
    fallbackBrief(ctx, notesForFallback, format, mediaMode);

  function normalizeBrief(brief: FlyerBrief): FlyerBrief {
    const validIds = (brief.reference_media_ids || []).filter((id) =>
      allowedIds.has(id)
    );

    if (mediaMode === "fresh" || candidates.length === 0) {
      return {
        ...brief,
        use_uploaded_media: false,
        reference_media_ids: [],
      };
    }

    if (mediaMode === "library") {
      const refs =
        validIds.length > 0
          ? validIds.slice(0, 2)
          : candidates
              .slice()
              .sort((a, b) => Number(b.is_favourite) - Number(a.is_favourite))
              .slice(0, 2)
              .map((m) => m.id);
      return {
        ...brief,
        use_uploaded_media: refs.length > 0,
        reference_media_ids: refs,
      };
    }

    // auto
    const refs = brief.use_uploaded_media ? validIds.slice(0, 2) : [];
    return {
      ...brief,
      use_uploaded_media: refs.length > 0,
      reference_media_ids: refs,
    };
  }

  const result = await runStructured({
    schema: flyerBriefSchema,
    system: `${JACITA_SYSTEM}
You design promotional flyer briefs for small businesses.
Return concise marketing copy PLUS a detailed image_prompt an image model can render.
The image_prompt must include exact headline/subheadline/CTA text to paint into the graphic.
Avoid neon cyberpunk looks. Prefer clean premium print/social flyer aesthetics.
Do not invent fake phone numbers or addresses not in the business context.

Media policy:
- If usable library photos exist, SOMETIMES set use_uploaded_media=true and pick 1–2 reference_media_ids from the catalog so the flyer features real business photography.
- Prefer library photos when the brief mentions real work, staff, before/after, products, salon/shop atmosphere, or "use our photos".
- Prefer fresh AI-only art when the brief wants abstract branding, seasonal illustration, or no suitable photo exists.
- Never invent media IDs. Only use IDs from the catalog. If the catalog is empty, use_uploaded_media must be false.`,
    prompt: `${formatBusinessContextPrompt(ctx, {
      focusServiceId: options.productServiceId,
    })}

USABLE LIBRARY PHOTOS (images only; exclude AI flyers):
${mediaCatalog || "- none available"}

Media mode preference: ${mediaMode}
- auto = decide wisely (often use photos when they fit)
- library = strongly prefer uploaded photos when any exist
- fresh = do not use library photos

Task: create a flyer brief.
Format: ${format} (${formatSize(format)})
User brief: ${notes || "(none — invent a strong promotional angle from the business profile)"}
Featured service preference: ${focus?.name || "AI choose best fit"}

Return headline, subheadline, cta, visual_direction, style_notes, colour_guidance, image_prompt, use_uploaded_media, and reference_media_ids.`,
    fallback,
  });

  if (!result.ok) return result;
  return { ...result, data: normalizeBrief(result.data) };
}

function composeImagePrompt(
  brief: FlyerBrief,
  format: FlyerFormatId,
  hasReferences: boolean
) {
  return [
    brief.image_prompt,
    `Layout format: ${format} (${formatSize(format)}).`,
    `Render these exact text elements clearly: headline "${brief.headline}", subheadline "${brief.subheadline}", CTA "${brief.cta}".`,
    brief.visual_direction,
    brief.style_notes,
    brief.colour_guidance,
    hasReferences
      ? "The attached image(s) are real business photos — feature them as the hero visual of the flyer; crop/compose tastefully; keep subjects recognisable; add marketing typography and layout around them."
      : null,
    "Single finished flyer graphic, no mockup frames, no torn paper edges, no stock watermark.",
  ]
    .filter(Boolean)
    .join("\n");
}

export async function generateFlyerImage(options: {
  brief: FlyerBrief;
  format: FlyerFormatId;
  referenceImages?: Array<Uint8Array | Buffer>;
}) {
  if (!hasOpenAIKey()) {
    return {
      ok: false as const,
      error: "OPENAI_API_KEY is not set. Add it to use AI flyer design.",
    };
  }

  try {
    const size = formatSize(options.format);
    const refs = (options.referenceImages || []).filter((b) => b.byteLength > 0);
    const text = composeImagePrompt(options.brief, options.format, refs.length > 0);

    const { image } = await generateImage({
      model: openai.image("gpt-image-2.5-sunburst"),
      prompt:
        refs.length > 0
          ? {
              text,
              images: refs,
            }
          : text,
      size,
      providerOptions: {
        openai: {
          quality: "high",
          outputFormat: "png",
          ...(refs.length > 0
            ? { inputFidelity: "high" as const }
            : {}),
        },
      },
    });

    const base64 = image.base64;
    if (!base64) {
      return {
        ok: false as const,
        error: "OpenAI returned an empty image.",
      };
    }

    const bytes = Buffer.from(base64, "base64");
    return {
      ok: true as const,
      bytes,
      mimeType: "image/png" as const,
      width: size === "1536x1024" ? 1536 : 1024,
      height:
        size === "1024x1536" ? 1536 : size === "1536x1024" ? 1024 : 1024,
      model: "gpt-image-2.5-sunburst",
      usedReferences: refs.length,
    };
  } catch (error) {
    const classified = classifyOpenAiError(error);
    return {
      ok: false as const,
      error: classified.detail,
      reason: classified.reason,
    };
  }
}

/** Download library image bytes for flyer reference (org-scoped). */
export async function loadFlyerReferenceImages(options: {
  supabase: {
    storage: {
      from: (bucket: string) => {
        download: (
          path: string
        ) => Promise<{ data: Blob | null; error: { message: string } | null }>;
      };
    };
  };
  organisationId: string;
  mediaIds: string[];
  context: BusinessContext;
}) {
  const allowed = new Set(
    libraryImageCandidates(options.context).map((m) => m.id)
  );
  const selected = options.mediaIds.filter((id) => allowed.has(id)).slice(0, 2);
  const buffers: Buffer[] = [];
  const usedIds: string[] = [];

  for (const id of selected) {
    const asset = options.context.media.find((m) => m.id === id);
    const path = asset?.storage_path;
    if (!path || !path.startsWith(`${options.organisationId}/`)) continue;

    const { data, error } = await options.supabase.storage
      .from("media")
      .download(path);
    if (error || !data) continue;

    const ab = await data.arrayBuffer();
    if (ab.byteLength < 32) continue;
    // Cap very large refs (~8 MB) to keep image edit requests manageable
    if (ab.byteLength > 8 * 1024 * 1024) continue;

    buffers.push(Buffer.from(ab));
    usedIds.push(id);
  }

  return { buffers, usedIds };
}
