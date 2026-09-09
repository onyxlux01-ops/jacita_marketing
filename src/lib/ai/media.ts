import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { runStructured } from "@/lib/ai/model";
import {
  mediaRecommendSchema,
  type MediaRecommend,
} from "@/lib/ai/schemas";

function keywordScore(text: string, query: string) {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  const hay = text.toLowerCase();
  return tokens.reduce((score, token) => (hay.includes(token) ? score + 1 : score), 0);
}

function fallbackRecommend(
  ctx: BusinessContext,
  query: string
): MediaRecommend {
  if (!ctx.media.length) {
    return {
      recommended_media_ids: [],
      reasons: [],
      needs_new_media: true,
      message:
        "No media found for this business. Upload relevant photos or videos before publishing visual posts.",
      suitability: [],
    };
  }

  const ranked = [...ctx.media]
    .map((m) => {
      const text = `${m.description || ""} ${m.category || ""} ${(m.tags || []).join(" ")} ${m.media_type}`;
      const score =
        keywordScore(text, query) * 3 +
        (m.is_favourite ? 2 : 0) +
        (typeof m.usage_count === "number" ? Math.max(0, 3 - m.usage_count) : 0) +
        (m.media_type === "video" && /reel|video|tiktok/i.test(query) ? 1 : 0);
      return { id: m.id, score, text };
    })
    .sort((a, b) => b.score - a.score);

  const top = ranked.filter((r) => r.score > 0).slice(0, 3);
  if (!top.length) {
    return {
      recommended_media_ids: [],
      reasons: [],
      needs_new_media: true,
      message: `No media clearly matches “${query}”. Upload assets tagged or described for this theme.`,
      suitability: [],
    };
  }

  return {
    recommended_media_ids: top.map((t) => t.id),
    reasons: top.map((t) => `Matched library item (${t.text.trim() || t.id})`),
    needs_new_media: false,
    message: "Recommended existing media from this business library only.",
    suitability: top.map((t) => ({
      media_id: t.id,
      suitable: true,
      notes: "Matched description/category/tags for this organisation.",
    })),
  };
}

export async function recommendMedia(options: {
  context: BusinessContext;
  query: string;
  contentType?: string | null;
  platform?: string | null;
}) {
  const { context: ctx, query } = options;
  const fallback = () =>
    fallbackRecommend(
      ctx,
      `${query} ${options.contentType || ""} ${options.platform || ""}`
    );

  const allowedIds = new Set(ctx.media.map((m) => m.id));

  const result = await runStructured({
    schema: mediaRecommendSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(ctx)}

TASK: Recommend media assets for this brief.
Query: ${query}
Content type: ${options.contentType || "n/a"}
Platform: ${options.platform || "n/a"}

Return ONLY media IDs from the MEDIA LIBRARY list above.
If none fit, set needs_new_media=true and explain what to upload.`,
    fallback,
  });

  if (!result.ok) return result;

  const filtered = {
    ...result.data,
    recommended_media_ids: result.data.recommended_media_ids.filter((id) =>
      allowedIds.has(id)
    ),
  };

  if (
    !filtered.recommended_media_ids.length &&
    !filtered.needs_new_media &&
    ctx.media.length === 0
  ) {
    filtered.needs_new_media = true;
    filtered.message =
      "No media found for this business. Upload relevant assets first.";
  }

  return { ...result, data: filtered };
}
