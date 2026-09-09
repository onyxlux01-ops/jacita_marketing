import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { goalLabel, type MarketingGoalKey } from "@/lib/ai/goals";
import { runStructured } from "@/lib/ai/model";
import { strategySchema, type StrategyResult } from "@/lib/ai/schemas";

function fallbackStrategy(
  ctx: BusinessContext,
  goalKey: MarketingGoalKey
): StrategyResult {
  const featured =
    ctx.services.find((s) => s.is_featured) ||
    ctx.services.find((s) => s.is_promotion) ||
    ctx.services[0];
  const audience =
    ctx.brand?.target_audience ||
    `People near ${ctx.organisation.location || "your area"} looking for ${
      ctx.organisation.business_category || "your services"
    }`;

  return {
    title: `${goalLabel(goalKey)} strategy for ${ctx.organisation.name}`,
    primary_objective: goalLabel(goalKey),
    target_audience: audience,
    key_message: featured
      ? `Highlight ${featured.name} with clear proof and an easy next step.`
      : `Show what makes ${ctx.organisation.name} worth choosing locally.`,
    services_to_promote: featured ? [featured.name] : [],
    content_themes: [
      "Proof / results",
      "Education",
      "Behind the scenes",
      "Offer / availability",
      "Community",
    ],
    recommended_platforms: ["instagram", "tiktok", "facebook"],
    recommended_content_types: [
      "service_spotlight",
      "reel",
      "testimonial",
      "educational",
      "behind_the_scenes",
    ],
    posting_frequency: "5–7 posts per week across platforms",
    campaign_duration: "7 days",
    calls_to_action: [
      ctx.organisation.booking_url
        ? "Book via the booking link"
        : "Message to book",
      "Save this post for later",
    ],
    content_mix: [
      { theme: "transformations / proof", percentage: 40 },
      { theme: "educational", percentage: 20 },
      { theme: "testimonials", percentage: 20 },
      { theme: "promotional", percentage: 10 },
      { theme: "behind the scenes", percentage: 10 },
    ],
    rationale: featured
      ? `Lead with ${featured.name} because it is the clearest offer in the catalogue for this goal.`
      : "Build trust first, then invite a booking or enquiry.",
  };
}

export async function generateMarketingStrategy(options: {
  context: BusinessContext;
  goalKey: MarketingGoalKey;
  requestText?: string | null;
  focusServiceId?: string | null;
}) {
  const { context: ctx, goalKey } = options;
  return runStructured({
    schema: strategySchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(ctx, {
      goalKey,
      focusServiceId: options.focusServiceId,
    })}

USER REQUEST: ${options.requestText || "Create a marketing strategy for the goal."}

TASK: Produce a practical marketing strategy for THIS business only.
Include a content mix with percentages that sum near 100.
Tailor themes to the business type, services, and goal — do not use a generic template.`,
    fallback: () => fallbackStrategy(ctx, goalKey),
  });
}
