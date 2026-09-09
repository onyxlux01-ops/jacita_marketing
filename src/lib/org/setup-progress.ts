import type { MarketingGoalKey } from "@/lib/ai/goals";
import { MARKETING_GOALS } from "@/lib/ai/goals";
import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const ONBOARDING_STEPS = [
  "business",
  "brand",
  "services",
  "audience",
  "goals",
  "media",
  "social",
  "complete",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const BRAND_VOICE_OPTIONS = [
  "Professional",
  "Luxury",
  "Friendly",
  "Playful",
  "Bold",
  "Minimal",
  "Warm",
  "Community-focused",
] as const;

export const MEDIA_CATEGORIES = [
  "Service",
  "Promotion",
  "Before & After",
  "Staff",
  "Behind the Scenes",
  "Brand",
  "Other",
] as const;

export type SetupItemStatus = "complete" | "incomplete" | "optional";

export type SetupProgress = {
  organisationId: string;
  organisationName: string;
  completed: boolean;
  currentStep: OnboardingStep;
  items: Array<{
    id: OnboardingStep | "business";
    label: string;
    status: SetupItemStatus;
    href: string;
    detail: string;
  }>;
  completeCount: number;
  totalRequired: number;
};

export async function getSetupProgress(
  supabase: Supabase,
  organisationId: string
): Promise<SetupProgress | null> {
  const [
    { data: org },
    { data: brand },
    { data: audience },
    { count: serviceCount },
    { count: mediaCount },
    { data: goals },
    { data: social },
  ] = await Promise.all([
    supabase
      .from("organisations")
      .select(
        "id, name, description, business_category, location, country, onboarding_completed_at, onboarding_step, primary_marketing_goal_key"
      )
      .eq("id", organisationId)
      .maybeSingle(),
    supabase
      .from("brand_profiles")
      .select(
        "brand_voice, tone, target_audience, business_description, primary_color, custom_instructions"
      )
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase
      .from("audience_profiles")
      .select("ideal_customer_description, age_range, location_focus")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    supabase
      .from("products_services")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("is_active", true),
    supabase
      .from("media_assets")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", organisationId)
      .eq("is_active", true),
    supabase
      .from("marketing_goals")
      .select("goal_key, status")
      .eq("organisation_id", organisationId)
      .eq("status", "active"),
    supabase
      .from("social_accounts")
      .select("platform, connection_status")
      .eq("organisation_id", organisationId),
  ]);

  if (!org) return null;

  const businessOk = Boolean(
    org.name && (org.description || org.business_category)
  );
  const brandOk = Boolean(
    brand?.brand_voice || brand?.tone || brand?.business_description
  );
  const servicesOk = (serviceCount ?? 0) > 0;
  const audienceOk = Boolean(
    audience?.ideal_customer_description ||
      audience?.age_range ||
      brand?.target_audience
  );
  const goalsOk =
    Boolean(org.primary_marketing_goal_key) || (goals?.length ?? 0) > 0;
  const mediaOk = (mediaCount ?? 0) > 0;
  const connectedSocial = (social ?? []).filter(
    (s) => s.connection_status === "connected"
  ).length;

  const items: SetupProgress["items"] = [
    {
      id: "business",
      label: "Business",
      status: businessOk ? "complete" : "incomplete",
      href: "/app/settings?section=business",
      detail: businessOk ? "Complete" : "Add business details",
    },
    {
      id: "brand",
      label: "Brand",
      status: brandOk ? "complete" : "incomplete",
      href: "/app/onboarding/setup?step=brand",
      detail: brandOk ? "Complete" : "Add brand voice",
    },
    {
      id: "services",
      label: "Services",
      status: servicesOk ? "complete" : "incomplete",
      href: "/app/onboarding/setup?step=services",
      detail: servicesOk
        ? `${serviceCount} active`
        : "Add what you sell",
    },
    {
      id: "audience",
      label: "Audience",
      status: audienceOk ? "complete" : "incomplete",
      href: "/app/onboarding/setup?step=audience",
      detail: audienceOk ? "Complete" : "Describe ideal customers",
    },
    {
      id: "goals",
      label: "Goals",
      status: goalsOk ? "complete" : "incomplete",
      href: "/app/onboarding/setup?step=goals",
      detail: goalsOk
        ? MARKETING_GOALS.find(
            (g) => g.key === (org.primary_marketing_goal_key as MarketingGoalKey)
          )?.label || "Goals set"
        : "Choose a primary goal",
    },
    {
      id: "media",
      label: "Media",
      status: mediaOk ? "complete" : "optional",
      href: "/app/onboarding/setup?step=media",
      detail: mediaOk
        ? `${mediaCount} assets`
        : "Upload photos & videos",
    },
    {
      id: "social",
      label: "Social Accounts",
      status: connectedSocial > 0 ? "complete" : "optional",
      href: "/app/onboarding/setup?step=social",
      detail:
        connectedSocial > 0
          ? `${connectedSocial} connected`
          : "Not connected",
    },
  ];

  const required = items.filter((i) => i.id !== "media" && i.id !== "social");
  const completeCount = required.filter((i) => i.status === "complete").length;

  const step = (org.onboarding_step || "brand") as OnboardingStep;

  return {
    organisationId: org.id,
    organisationName: org.name,
    completed: Boolean(org.onboarding_completed_at),
    currentStep: ONBOARDING_STEPS.includes(step) ? step : "brand",
    items,
    completeCount,
    totalRequired: required.length,
  };
}
