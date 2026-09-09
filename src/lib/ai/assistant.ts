import type { BusinessContext } from "@/lib/ai/context";
import { JACITA_SYSTEM, formatBusinessContextPrompt } from "@/lib/ai/context";
import {
  goalLabel,
  mapLegacyObjective,
  type MarketingGoalKey,
} from "@/lib/ai/goals";
import { runStructured } from "@/lib/ai/model";
import {
  assistantIntentSchema,
  type AssistantIntent,
} from "@/lib/ai/schemas";

function detectIntentHeuristic(
  text: string,
  ctx: BusinessContext
): AssistantIntent {
  const lower = text.toLowerCase();
  const featured =
    ctx.services.find((s) => s.is_featured) ||
    ctx.services.find((s) => s.is_promotion) ||
    ctx.services[0];

  let intent: AssistantIntent["intent"] = "create_content";
  let goalKey: MarketingGoalKey = "increase_brand_awareness";

  if (/week|weekly|this week|7.?day|content plan|social media plan/.test(lower)) {
    intent = "weekly_plan";
    goalKey = "increase_engagement";
  } else if (/campaign/.test(lower)) {
    intent = "create_campaign";
    goalKey = "promote_service";
  } else if (/booking|bookings|appointments|quiet|fill/.test(lower)) {
    intent = "get_bookings";
    goalKey = /quiet|fill/.test(lower)
      ? "fill_quiet_periods"
      : "increase_bookings";
  } else if (/follower|following|grow (ig|instagram|tiktok|social)/.test(lower)) {
    intent = "grow_following";
    goalKey = "increase_followers";
  } else if (/promot|spotlight|new service|launch/.test(lower)) {
    intent = "promote_service";
    goalKey = /new/.test(lower) ? "promote_new_service" : "promote_service";
  } else if (/analys|insight|engagement dropped|why has|performance/.test(lower)) {
    intent = "analyse_performance";
    goalKey = "increase_engagement";
  }

  const matchedService =
    ctx.services.find((s) => lower.includes(s.name.toLowerCase())) || featured;

  const recommendation = matchedService
    ? `Based on ${ctx.organisation.name}, I’d lead with “${matchedService.name}” for ${goalLabel(goalKey)}. I can turn this into a focused plan next.`
    : `For ${ctx.organisation.name}, I recommend focusing on ${goalLabel(goalKey)}. Add services in Settings/Services so recommendations can be more specific.`;

  return {
    intent,
    goal_key: goalKey,
    summary: `Understood: ${goalLabel(goalKey)} for ${ctx.organisation.name}.`,
    recommendation,
    suggested_service_name: matchedService?.name ?? null,
    suggested_action_label:
      intent === "weekly_plan"
        ? "Create this week's content"
        : intent === "create_campaign" || intent === "get_bookings"
          ? "Create campaign"
          : intent === "analyse_performance"
            ? "Analyse performance"
            : "Create content",
    missing_information: ctx.gaps.slice(0, 4),
  };
}

export async function interpretAssistantRequest(options: {
  context: BusinessContext;
  requestText: string;
  presetIntent?: string | null;
}) {
  const text = options.requestText.trim();
  if (options.presetIntent) {
    const mapped = mapPreset(options.presetIntent, options.context);
    return {
      ok: true as const,
      data: mapped,
      demo: true as const,
      model: "demo" as const,
    };
  }

  return runStructured({
    schema: assistantIntentSchema,
    system: JACITA_SYSTEM,
    prompt: `${formatBusinessContextPrompt(options.context)}

USER SAID: "${text}"

TASK: Interpret the natural-language marketing request for THIS business only.
Pick the best intent and goal_key.
Write a short recommendation that names a concrete next marketing outcome (not a vague chat reply).
If a service in the catalogue matches, set suggested_service_name exactly.
List missing_information only from real gaps.`,
    fallback: () => detectIntentHeuristic(text || "help", options.context),
  });
}

function mapPreset(
  preset: string,
  ctx: BusinessContext
): AssistantIntent {
  const featured =
    ctx.services.find((s) => s.is_featured) || ctx.services[0] || null;
  const map: Record<string, AssistantIntent["intent"]> = {
    week: "weekly_plan",
    promote: "promote_service",
    growth: "grow_following",
    bookings: "get_bookings",
    campaign: "create_campaign",
    analyse: "analyse_performance",
    analyze: "analyse_performance",
  };
  const intent = map[preset] || "create_content";
  const goalKey = mapLegacyObjective(
    preset === "week"
      ? "engagement"
      : preset === "growth"
        ? "followers"
        : preset === "bookings"
          ? "bookings"
          : preset === "promote"
            ? "promotion"
            : "awareness"
  );

  return {
    intent,
    goal_key: goalKey,
    summary: `${goalLabel(goalKey)} for ${ctx.organisation.name}`,
    recommendation: featured
      ? `Based on your business, a strong focus is “${featured.name}”. I recommend a short plan tied to ${goalLabel(goalKey)}.`
      : `I recommend a short plan for ${goalLabel(goalKey)}. Add services so Jacita can be more specific.`,
    suggested_service_name: featured?.name ?? null,
    suggested_action_label:
      intent === "weekly_plan"
        ? "Create this week's content"
        : intent === "analyse_performance"
          ? "Analyse performance"
          : intent === "create_campaign" || intent === "get_bookings"
            ? "Create campaign"
            : "Create content",
    missing_information: ctx.gaps.slice(0, 4),
  };
}
