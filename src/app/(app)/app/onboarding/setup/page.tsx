import Link from "next/link";
import { redirect } from "next/navigation";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  getSetupProgress,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "@/lib/org/setup-progress";
import { SetupWizard } from "./setup-wizard";
import { cn } from "@/lib/utils";

export default async function OnboardingSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>;
}) {
  const { step: stepParam } = await searchParams;
  const orgs = await getUserOrganisations();
  if (!orgs.length) redirect("/app/onboarding");

  const active = await getActiveOrganisation(orgs);
  if (!active || !hasSupabaseEnv()) redirect("/app/onboarding");

  const supabase = await createClient();
  const progress = await getSetupProgress(supabase, active.id);
  if (!progress) redirect("/app/onboarding");

  const step = (
    ONBOARDING_STEPS.includes(stepParam as OnboardingStep)
      ? stepParam
      : progress.currentStep === "complete"
        ? "brand"
        : progress.currentStep
  ) as OnboardingStep;

  const [
    { data: brand },
    { data: audience },
    { data: services },
    { data: goals },
    { data: social },
    { count: mediaCount },
    { data: org },
  ] = await Promise.all([
    supabase
      .from("brand_profiles")
      .select(
        "brand_voice, tone, target_audience, business_description, preferred_terminology, words_to_avoid, primary_color, secondary_color, custom_instructions, logo_path"
      )
      .eq("organisation_id", active.id)
      .maybeSingle(),
    supabase
      .from("audience_profiles")
      .select("*")
      .eq("organisation_id", active.id)
      .maybeSingle(),
    supabase
      .from("products_services")
      .select(
        "id, name, description, category, price, duration_minutes, target_audience, is_featured, is_promotion, is_active"
      )
      .eq("organisation_id", active.id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("marketing_goals")
      .select("goal_key, status")
      .eq("organisation_id", active.id)
      .eq("status", "active"),
    supabase
      .from("social_accounts")
      .select(
        "platform, connection_status, account_name, account_handle"
      )
      .eq("organisation_id", active.id),
    supabase
      .from("media_assets")
      .select("*", { count: "exact", head: true })
      .eq("organisation_id", active.id)
      .eq("is_active", true),
    supabase
      .from("organisations")
      .select("primary_marketing_goal_key")
      .eq("id", active.id)
      .maybeSingle(),
  ]);

  const stepMeta = [
    { id: "business", label: "Business" },
    { id: "brand", label: "Brand" },
    { id: "services", label: "Services" },
    { id: "audience", label: "Audience" },
    { id: "goals", label: "Goals" },
    { id: "media", label: "Media" },
    { id: "social", label: "Social Accounts" },
  ] as const;

  return (
    <div className="jacita-page jacita-enter max-w-3xl space-y-6">
      <header>
        <p className="jacita-label">Business setup</p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          Set up {active.name}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete each section when you can. Skip anything non-essential and
          return later from settings.
        </p>
      </header>

      <ol className="flex flex-wrap gap-2">
        {stepMeta.map((s, index) => {
          const item = progress.items.find((i) => i.id === s.id);
          const done = item?.status === "complete";
          const current = step === s.id;
          return (
            <li key={s.id}>
              <Link
                href={`/app/onboarding/setup?step=${s.id}`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium",
                  current
                    ? "bg-primary/15 text-primary"
                    : done
                      ? "bg-muted text-foreground"
                      : "bg-muted/60 text-muted-foreground"
                )}
              >
                {done ? "✓" : index + 1} {s.label}
              </Link>
            </li>
          );
        })}
      </ol>

      <SetupWizard
        organisationId={active.id}
        organisationName={active.name}
        step={step}
        brand={brand}
        audience={audience}
        services={services ?? []}
        goalKeys={(goals ?? []).map((g) => g.goal_key)}
        primaryGoal={org?.primary_marketing_goal_key ?? null}
        social={social ?? []}
        mediaCount={mediaCount ?? 0}
      />
    </div>
  );
}
