import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { goalLabel, type MarketingGoalKey } from "@/lib/ai/goals";
import { runStructured } from "@/lib/ai/model";
import { generateMarketingStrategy } from "@/lib/ai/strategy";
import { campaignPlanSchema, type CampaignPlan } from "@/lib/ai/schemas";

function fallbackCampaign(
  ctx: BusinessContext,
  goalKey: MarketingGoalKey
): CampaignPlan {
  const service =
    ctx.services.find((s) => s.is_featured)?.name ||
    ctx.services.find((s) => s.is_promotion)?.name ||
    ctx.services[0]?.name ||
    "core offer";
  const duration = 7;
  const platforms: Array<"instagram" | "facebook" | "tiktok"> = [
    "instagram",
    "tiktok",
    "facebook",
    "instagram",
    "tiktok",
  ];

  return {
    name: `${service} · ${goalLabel(goalKey)}`,
    objective: goalLabel(goalKey),
    target_audience:
      ctx.brand?.target_audience ||
      `Local customers interested in ${ctx.organisation.business_category || "your offer"}`,
    key_message: `Choose ${ctx.organisation.name} for ${service} — clear results, easy next step.`,
    services_products: [service],
    content_themes: ["Proof", "Education", "Availability", "Social proof"],
    platform_recommendations: ["instagram", "tiktok", "facebook"],
    call_to_action: ctx.organisation.booking_url
      ? "Book now"
      : "Enquire today",
    campaign_duration_days: duration,
    start_offset_days: 0,
    budget_suggestion: null,
    content_items: platforms.map((platform, i) => {
      const when = new Date();
      when.setDate(when.getDate() + i);
      when.setHours(18, 0, 0, 0);
      return {
        day_offset: i,
        platform,
        content_type:
          i % 2 === 0 ? "reel" : i === 2 ? "testimonial" : "service_spotlight",
        title: `${service} day ${i + 1}`,
        hook: `${service} at ${ctx.organisation.name}`,
        caption: `Campaign post for ${service} — ${goalLabel(goalKey)}.`,
        call_to_action: ctx.organisation.booking_url
          ? "Book via the link in bio"
          : "Message to book",
        hashtags: [
          ctx.organisation.name.replace(/\s+/g, "").toLowerCase().slice(0, 20),
          platform,
        ],
        suggested_posting_time: when.toISOString(),
        video_concept:
          platform !== "facebook"
            ? "Open on proof, show process, end with CTA."
            : null,
        product_service_name: service,
        recommended_media_ids: [],
      };
    }),
  };
}

export async function generateCampaign(options: {
  context: BusinessContext;
  goalKey: MarketingGoalKey;
  requestText?: string | null;
  focusServiceId?: string | null;
}) {
  const strategy = await generateMarketingStrategy({
    context: options.context,
    goalKey: options.goalKey,
    requestText: options.requestText,
    focusServiceId: options.focusServiceId,
  });

  const allowedIds = new Set(options.context.media.map((m) => m.id));

  const result = await runStructured({
    schema: campaignPlanSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context, {
      goalKey: options.goalKey,
      focusServiceId: options.focusServiceId,
    })}

STRATEGY JSON:
${JSON.stringify(strategy.ok ? strategy.data : {}, null, 2)}

USER REQUEST: ${options.requestText || "Create a campaign."}

TASK: Create an editable draft campaign plan with associated content items.
Keep content as drafts conceptually (never mark published).
Only use media IDs from this organisation's library.`,
    fallback: () => fallbackCampaign(options.context, options.goalKey),
  });

  if (!result.ok) return result;

  const plan: CampaignPlan = {
    ...result.data,
    content_items: result.data.content_items.map((item) => ({
      ...item,
      recommended_media_ids: item.recommended_media_ids.filter((id) =>
        allowedIds.has(id)
      ),
    })),
  };

  return {
    ...result,
    data: {
      campaign: plan,
      strategy: strategy.ok ? strategy.data : null,
    },
  };
}
