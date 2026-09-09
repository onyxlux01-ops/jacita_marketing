import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import { goalLabel, type MarketingGoalKey } from "@/lib/ai/goals";
import { runStructured } from "@/lib/ai/model";
import { generateMarketingStrategy } from "@/lib/ai/strategy";
import { weeklyPlanSchema, type WeeklyPlan } from "@/lib/ai/schemas";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function fallbackWeeklyPlan(
  ctx: BusinessContext,
  goalKey: MarketingGoalKey,
  strategySummary: string
): WeeklyPlan {
  const service =
    ctx.services.find((s) => s.is_featured)?.name ||
    ctx.services[0]?.name ||
    "your main offer";
  const templates: Array<{
    platform: "instagram" | "facebook" | "tiktok";
    content_type: string;
    theme: string;
  }> = [
    { platform: "instagram", content_type: "reel", theme: "Client / product proof" },
    { platform: "tiktok", content_type: "educational", theme: "Quick tip" },
    {
      platform: "instagram",
      content_type: "service_spotlight",
      theme: `${service} spotlight`,
    },
    { platform: "facebook", content_type: "testimonial", theme: "Community trust" },
    {
      platform: "instagram",
      content_type: "behind_the_scenes",
      theme: "Behind the scenes",
    },
    { platform: "tiktok", content_type: "short_video", theme: "Trend / process" },
    {
      platform: "instagram",
      content_type: "promotional",
      theme: "Availability / next step",
    },
  ];

  return {
    plan_title: `Week plan · ${ctx.organisation.name}`,
    goal_summary: goalLabel(goalKey),
    strategy_summary: strategySummary,
    items: DAYS.map((day, i) => {
      const t = templates[i];
      const when = new Date();
      const dayIndex = (when.getDay() + 6) % 7; // mon=0
      const offset = (i - dayIndex + 7) % 7 || 7;
      when.setDate(when.getDate() + offset);
      when.setHours(17 + (i % 3), 0, 0, 0);
      return {
        day,
        platform: t.platform,
        content_type: t.content_type,
        theme: t.theme,
        title: `${t.theme} · ${ctx.organisation.name}`,
        hook: `${service} at ${ctx.organisation.name}`,
        caption: `A ${t.theme.toLowerCase()} post for ${ctx.organisation.name} focused on ${service}.`,
        call_to_action: ctx.organisation.booking_url
          ? "Book via the link in bio"
          : "Message us to enquire",
        hashtags: [
          ctx.organisation.name.replace(/\s+/g, "").toLowerCase().slice(0, 20),
          t.platform,
        ],
        suggested_posting_time: when.toISOString(),
        video_concept:
          t.content_type.includes("reel") || t.content_type.includes("video")
            ? "Open on the result, show process, end with CTA."
            : null,
        product_service_name: service,
        recommended_media_ids: [],
      };
    }),
  };
}

export async function generateWeeklyPlan(options: {
  context: BusinessContext;
  goalKey: MarketingGoalKey;
  requestText?: string | null;
  focusServiceId?: string | null;
  /** Aggregated learning from weekly review / performance — never raw metrics dump */
  learningContext?: string | null;
}) {
  const strategy = await generateMarketingStrategy({
    context: options.context,
    goalKey: options.goalKey,
    requestText: options.requestText,
    focusServiceId: options.focusServiceId,
  });

  const strategySummary = strategy.ok
    ? `${strategy.data.title}: ${strategy.data.key_message}. Mix: ${strategy.data.content_mix
        .map((m) => `${m.percentage}% ${m.theme}`)
        .join(", ")}`
    : goalLabel(options.goalKey);

  const allowedIds = new Set(options.context.media.map((m) => m.id));
  const learning = options.learningContext
    ? `\nPERFORMANCE LEARNING (from this business only):\n${options.learningContext}\n`
    : "";

  const result = await runStructured({
    schema: weeklyPlanSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context, {
      goalKey: options.goalKey,
      focusServiceId: options.focusServiceId,
    })}

STRATEGY:
${strategySummary}
${learning}
USER REQUEST: ${options.requestText || "Create this week's social media plan."}

TASK: Create a 7-day content plan tailored to THIS business.
When PERFORMANCE LEARNING is present: increase formats that worked for the goal, reduce weak generic promo, avoid duplicating recent posts, keep variety.
Vary platforms and content types using the strategy mix.
Do not use the same template for every business type.
Only recommend media IDs from the library list.
Each item needs platform-specific copy.`,
    fallback: () =>
      fallbackWeeklyPlan(options.context, options.goalKey, strategySummary),
  });

  if (!result.ok) {
    return result;
  }

  return {
    ...result,
    data: {
      plan: {
        ...result.data,
        items: result.data.items.map((item) => ({
          ...item,
          recommended_media_ids: item.recommended_media_ids.filter((id) =>
            allowedIds.has(id)
          ),
        })),
      },
      strategy: strategy.ok ? strategy.data : null,
    },
  };
}
