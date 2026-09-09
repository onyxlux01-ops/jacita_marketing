import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { runStructured } from "@/lib/ai/model";
import {
  contentValidationSchema,
  type ContentValidation,
  type GeneratedContent,
} from "@/lib/ai/schemas";

const AI_ISH_PHRASES = [
  "delve into",
  "in today's fast-paced world",
  "elevate your",
  "unlock your potential",
  "game-changer",
  "seamless experience",
  "embark on a journey",
];

function heuristicValidate(
  ctx: BusinessContext,
  content: GeneratedContent,
  options: {
    platform: string;
    serviceName?: string | null;
  }
): ContentValidation {
  const issues: string[] = [];
  const flags: string[] = [];
  const blob = `${content.title} ${content.hook} ${content.caption} ${content.call_to_action}`.toLowerCase();

  if (!blob.includes(ctx.organisation.name.toLowerCase().slice(0, 8)) && ctx.organisation.name.length > 3) {
    flags.push("Business name is not mentioned — optional but check brand fit.");
  }

  if (options.serviceName) {
    const serviceToken = options.serviceName.toLowerCase().split(/\s+/)[0];
    if (serviceToken && !blob.includes(serviceToken)) {
      issues.push(`Does not clearly promote “${options.serviceName}”.`);
    }
  }

  if (ctx.brand?.words_to_avoid) {
    const banned = ctx.brand.words_to_avoid
      .split(/[,;]/)
      .map((w) => w.trim().toLowerCase())
      .filter(Boolean);
    for (const word of banned) {
      if (blob.includes(word)) {
        issues.push(`Uses avoided word/phrase: “${word}”.`);
      }
    }
  }

  for (const phrase of AI_ISH_PHRASES) {
    if (blob.includes(phrase)) {
      flags.push(`Sounds generic/AI-ish (“${phrase}”).`);
    }
  }

  if (content.hashtags.length < 3) {
    flags.push("Few hashtags — consider adding more platform-relevant tags.");
  }

  if (options.platform === "tiktok" && !content.video_concept && !content.on_screen_text) {
    flags.push("TikTok post lacks video concept / on-screen text.");
  }

  if (!content.call_to_action?.trim()) {
    issues.push("Missing call to action.");
  }

  // Factuality heuristics — inventing numbers/claims is high risk
  if (/\b\d{1,3}%\b/.test(blob) || /\bguaranteed?\b/.test(blob)) {
    issues.push(
      "Contains percentage claims or guarantees that may not be in business data."
    );
  }
  if (/\bawarded?\b|\bcertified\b|\b#1\b|\bbest in\b/.test(blob)) {
    flags.push(
      "Mentions awards/certifications/#1 claims — only keep if stored in business data."
    );
  }
  if (/\b£\s?\d|\b\$\s?\d|\bfrom \d/.test(blob)) {
    const knownPrices = ctx.services
      .map((s) => s.price)
      .filter((p): p is number => p != null)
      .map(String);
    const hasKnown = knownPrices.some((p) => blob.includes(p));
    if (!hasKnown) {
      issues.push(
        "Mentions a price that does not match a stored service price."
      );
    }
  }

  const score = Math.max(20, 100 - issues.length * 18 - flags.length * 6);
  const passed = issues.length === 0 && score >= 60;

  return {
    passed,
    score,
    issues,
    flags,
    summary: passed
      ? "Content passed quality checks for this business."
      : "Content needs review before approval.",
    should_regenerate: issues.length >= 2,
    brand_alignment: Math.max(40, 100 - flags.length * 8),
    objective_fit: options.serviceName ? (issues.some((i) => i.includes("promote")) ? 45 : 85) : 70,
    hook_strength: content.hook && content.hook.length > 12 ? 80 : 55,
    cta_quality: content.call_to_action?.trim() ? 80 : 30,
    platform_suitability:
      options.platform === "tiktok" && !content.video_concept ? 55 : 80,
    originality: flags.some((f) => f.includes("AI-ish")) ? 50 : 78,
    media_suitability: content.recommended_media_ids?.length ? 75 : 50,
    factuality_ok: !issues.some((i) =>
      /price|guarantee|percentage/i.test(i)
    ),
  };
}

export async function validateContent(options: {
  context: BusinessContext;
  content: GeneratedContent;
  platform: string;
  contentType?: string | null;
  serviceName?: string | null;
  goalLabel?: string | null;
}) {
  const fallback = () =>
    heuristicValidate(options.context, options.content, {
      platform: options.platform,
      serviceName: options.serviceName,
    });

  return runStructured({
    schema: contentValidationSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context)}

TASK: Validate this generated social content BEFORE it is saved.
Platform: ${options.platform}
Content type: ${options.contentType || "n/a"}
Goal: ${options.goalLabel || "n/a"}
Focus service: ${options.serviceName || "n/a"}

CONTENT JSON:
${JSON.stringify(options.content, null, 2)}

Check:
1) Represents the correct business only
2) Promotes the correct service when specified
3) Matches brand voice / avoids banned words
4) CTA is appropriate
5) Claims are factual — no invented prices, awards, certifications, medical benefits, guarantees, or testimonials
6) Platform-appropriate
7) Not repetitive / not obvious AI filler
8) Useful for the target audience
9) Score dimensions when possible: brand_alignment, objective_fit, hook_strength, cta_quality, platform_suitability, originality, media_suitability
10) Set factuality_ok=false if inventing facts

If critical issues exist, set should_regenerate=true.`,
    fallback,
  });
}
