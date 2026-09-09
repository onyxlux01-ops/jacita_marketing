import type { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/database.types";

type Admin = ReturnType<typeof createAdminClient>;

export type AutomationMode = "off" | "manual" | "approval" | "autopilot";
export type AutomationState =
  | "off"
  | "starting"
  | "analysing"
  | "planning"
  | "creating"
  | "validating"
  | "scheduling"
  | "publishing"
  | "learning"
  | "paused"
  | "error"
  | "completed";

export type AiFreedomLevel = "conservative" | "balanced" | "aggressive";

export type AutomationSettings = {
  organisation_id: string;
  enabled: boolean;
  paused: boolean;
  mode: AutomationMode;
  posts_per_week: number;
  stories_per_week: number;
  reels_per_week: number;
  platforms: string[];
  content_preferences: string[];
  primary_goals: string[];
  quiet_hours: Json;
  max_auto_publishes_per_day: number;
  pipeline_horizon_days: number;
  current_state: AutomationState;
  state_message: string | null;
  setup_completed_at: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
  last_error: string | null;
  ai_freedom_level: AiFreedomLevel;
  latest_decision: Json;
  next_planned_action: string | null;
};

export async function getAutomationSettings(
  admin: Admin,
  organisationId: string
): Promise<AutomationSettings | null> {
  const { data } = await admin
    .from("automation_settings")
    .select("*")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  return (data as AutomationSettings | null)
    ? {
        ...(data as AutomationSettings),
        ai_freedom_level:
          (data as AutomationSettings).ai_freedom_level || "balanced",
        latest_decision: (data as AutomationSettings).latest_decision ?? {},
        next_planned_action:
          (data as AutomationSettings).next_planned_action ?? null,
      }
    : null;
}

export async function ensureAutomationSettings(
  admin: Admin,
  organisationId: string
): Promise<AutomationSettings> {
  const existing = await getAutomationSettings(admin, organisationId);
  if (existing) return existing;

  const { data: org } = await admin
    .from("organisations")
    .select("autopilot_mode")
    .eq("id", organisationId)
    .maybeSingle();

  const mode: AutomationMode =
    org?.autopilot_mode === "autopilot"
      ? "autopilot"
      : org?.autopilot_mode === "approval_required"
        ? "approval"
        : "manual";

  const { data, error } = await admin
    .from("automation_settings")
    .insert({
      organisation_id: organisationId,
      mode,
      enabled: false,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  const row = data as AutomationSettings;
  return {
    ...row,
    ai_freedom_level: row.ai_freedom_level || "balanced",
    latest_decision: row.latest_decision ?? {},
    next_planned_action: row.next_planned_action ?? null,
  };
}

export async function setAutomationState(
  admin: Admin,
  organisationId: string,
  state: AutomationState,
  message?: string | null
) {
  await admin
    .from("automation_settings")
    .update({
      current_state: state,
      state_message: message ?? null,
    })
    .eq("organisation_id", organisationId);
}

export async function logAutomationActivity(
  admin: Admin,
  input: {
    organisationId: string;
    runId?: string | null;
    eventType: string;
    message: string;
    severity?: "info" | "success" | "warning" | "error";
    metadata?: Json;
  }
) {
  await admin.from("automation_activity").insert({
    organisation_id: input.organisationId,
    run_id: input.runId ?? null,
    event_type: input.eventType,
    message: input.message,
    severity: input.severity ?? "info",
    metadata: input.metadata ?? {},
  });
}

export function modeToOrgAutopilot(
  mode: AutomationMode
): "manual" | "approval_required" | "autopilot" {
  if (mode === "autopilot") return "autopilot";
  if (mode === "approval") return "approval_required";
  return "manual";
}

export const CONTENT_PREFERENCE_OPTIONS = [
  { id: "promotional", label: "Promotional" },
  { id: "educational", label: "Educational" },
  { id: "engagement", label: "Engagement" },
  { id: "brand_awareness", label: "Brand awareness" },
  { id: "behind_the_scenes", label: "Behind the scenes" },
  { id: "services", label: "Services / products" },
  { id: "offers", label: "Offers" },
  { id: "testimonials", label: "Testimonials" },
  { id: "seasonal", label: "Seasonal" },
  { id: "community", label: "Community" },
] as const;

export const AUTOMATION_GOAL_OPTIONS = [
  { id: "increase_brand_awareness", label: "Increase awareness" },
  { id: "increase_followers", label: "Increase followers" },
  { id: "promote_service", label: "Promote services" },
  { id: "promote_new_service", label: "Promote products / new offers" },
  { id: "increase_engagement", label: "Increase engagement" },
  { id: "increase_bookings", label: "Drive bookings" },
] as const;
