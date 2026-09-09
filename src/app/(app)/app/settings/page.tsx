import Link from "next/link";
import { SettingsForm } from "./settings-form";
import { PublishingModePanel } from "./publishing-mode-panel";
import { TeamPanel, DangerZone } from "./team-danger";
import { SettingsNav } from "./settings-nav";
import { getActiveOrganisation, getSessionUser, getUserOrganisations } from "@/lib/org";
import type { Json, OrgRole } from "@/lib/database.types";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { SocialAccountsPanel } from "@/app/(app)/app/social/social-accounts-panel";
import { getSocialAdapter } from "@/lib/social/registry";
import type { ConnectionStatus, SocialPlatform } from "@/lib/types";
import { MARKETING_GOALS } from "@/lib/ai/goals";
import { ServiceForm } from "@/app/(app)/app/services/service-form";
import { ServiceList } from "@/app/(app)/app/services/service-list";

function openingHoursToText(value: Json | null): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    !Array.isArray(value) &&
    value !== null &&
    "text" in value &&
    typeof value.text === "string"
  ) {
    return value.text;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section: sectionParam } = await searchParams;
  const section = sectionParam || "business";
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);
  const user = await getSessionUser();

  let org: {
    id: string;
    name: string;
    business_category: string | null;
    description: string | null;
    location: string | null;
    website: string | null;
    booking_url: string | null;
    phone: string | null;
    email: string | null;
    opening_hours_text: string;
    logo_url: string | null;
    autopilot_mode: "manual" | "approval_required" | "autopilot";
    primary_marketing_goal_key: string | null;
  } | null = active
    ? {
        id: active.id,
        name: active.name,
        business_category: active.business_category,
        description: null,
        location: active.location,
        website: null,
        booking_url: null,
        phone: null,
        email: null,
        opening_hours_text: "",
        logo_url: null,
        autopilot_mode: "approval_required",
        primary_marketing_goal_key: null,
      }
    : null;

  let brand = {
    brand_voice: null as string | null,
    tone: null as string | null,
    target_audience: null as string | null,
    business_description: null as string | null,
    marketing_objectives: null as string | null,
    preferred_terminology: null as string | null,
    words_to_avoid: null as string | null,
    custom_instructions: null as string | null,
    primary_color: null as string | null,
    secondary_color: null as string | null,
  };

  let audience: {
    age_range: string | null;
    location_focus: string | null;
    interests: string[];
    customer_types: string[];
    income_lifestyle: string | null;
    ideal_customer_description: string | null;
  } | null = null;

  let services: Array<{
    id: string;
    name: string;
    description: string | null;
    category: string | null;
    price: number | null;
    duration_minutes: number | null;
    target_audience: string | null;
    is_featured: boolean;
    is_promotion: boolean;
    is_active: boolean;
  }> = [];

  let socialAccounts: Array<{
    id: string;
    platform: SocialPlatform;
    connection_status: ConnectionStatus;
    account_name: string | null;
    account_handle: string | null;
    profile_image_url: string | null;
    last_error: string | null;
    configured: boolean;
    availablePages: Array<{ id: string; name: string }>;
  }> = [];

  let members: Array<{
    id: string;
    role: OrgRole;
    user_id: string;
    full_name: string | null;
    isSelf: boolean;
  }> = [];
  let invites: Array<{
    id: string;
    email: string;
    role: OrgRole;
    status: string;
    expires_at: string;
  }> = [];
  let myRole: OrgRole | null = null;
  let activeGoals: string[] = [];

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const [
        { data: orgData },
        { data: brandData },
        { data: audienceData },
        { data: serviceData },
        { data: socialData },
        { data: memberData },
        { data: inviteData },
        { data: goalData },
        { data: myMembership },
      ] = await Promise.all([
        supabase
          .from("organisations")
          .select(
            "id, name, business_category, description, location, website, booking_url, phone, email, opening_hours, logo_path, autopilot_mode, primary_marketing_goal_key"
          )
          .eq("id", active.id)
          .maybeSingle(),
        supabase
          .from("brand_profiles")
          .select(
            "brand_voice, tone, target_audience, business_description, marketing_objectives, preferred_terminology, words_to_avoid, custom_instructions, primary_color, secondary_color"
          )
          .eq("organisation_id", active.id)
          .maybeSingle(),
        supabase
          .from("audience_profiles")
          .select(
            "age_range, location_focus, interests, customer_types, income_lifestyle, ideal_customer_description"
          )
          .eq("organisation_id", active.id)
          .maybeSingle(),
        supabase
          .from("products_services")
          .select(
            "id, name, description, category, price, duration_minutes, target_audience, is_featured, is_promotion, is_active"
          )
          .eq("organisation_id", active.id)
          .order("name"),
        supabase
          .from("social_accounts")
          .select(
            "id, platform, connection_status, account_name, account_handle, profile_image_url, last_error, metadata"
          )
          .eq("organisation_id", active.id),
        supabase
          .from("organisation_members")
          .select("id, role, user_id, users(full_name)")
          .eq("organisation_id", active.id),
        supabase
          .from("organisation_invites")
          .select("id, email, role, status, expires_at")
          .eq("organisation_id", active.id)
          .eq("status", "pending"),
        supabase
          .from("marketing_goals")
          .select("goal_key")
          .eq("organisation_id", active.id)
          .eq("status", "active"),
        user
          ? supabase
              .from("organisation_members")
              .select("role")
              .eq("organisation_id", active.id)
              .eq("user_id", user.id)
              .maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      if (orgData) {
        let logo_url: string | null = null;
        if (orgData.logo_path) {
          const { data: signed } = await supabase.storage
            .from("brand")
            .createSignedUrl(orgData.logo_path, 60 * 60);
          logo_url = signed?.signedUrl ?? null;
        }
        org = {
          id: orgData.id,
          name: orgData.name,
          business_category: orgData.business_category,
          description: orgData.description,
          location: orgData.location,
          website: orgData.website,
          booking_url: orgData.booking_url,
          phone: orgData.phone,
          email: orgData.email,
          opening_hours_text: openingHoursToText(orgData.opening_hours),
          logo_url,
          autopilot_mode:
            (orgData.autopilot_mode as
              | "manual"
              | "approval_required"
              | "autopilot") ?? "approval_required",
          primary_marketing_goal_key: orgData.primary_marketing_goal_key,
        };
      }
      if (brandData) brand = brandData;
      if (audienceData) {
        audience = {
          age_range: audienceData.age_range,
          location_focus: audienceData.location_focus,
          interests: audienceData.interests ?? [],
          customer_types: audienceData.customer_types ?? [],
          income_lifestyle: audienceData.income_lifestyle,
          ideal_customer_description: audienceData.ideal_customer_description,
        };
      }
      services = serviceData ?? [];
      const platforms: SocialPlatform[] = ["instagram", "facebook", "tiktok"];
      socialAccounts = platforms.map((platform) => {
        const row = (socialData ?? []).find((r) => r.platform === platform);
        const meta = (row?.metadata || {}) as {
          available_pages?: Array<{ id: string; name: string }>;
        };
        return {
          id: row?.id ?? "",
          platform,
          connection_status:
            (row?.connection_status as ConnectionStatus) ?? "not_connected",
          account_name: row?.account_name ?? null,
          account_handle: row?.account_handle ?? null,
          profile_image_url: row?.profile_image_url ?? null,
          last_error: row?.last_error ?? null,
          configured: getSocialAdapter(platform).isConfigured(),
          availablePages: meta.available_pages ?? [],
        };
      });
      members = (memberData ?? []).map((m) => {
        const u = m.users as { full_name: string | null } | { full_name: string | null }[] | null;
        const profile = Array.isArray(u) ? u[0] : u;
        return {
          id: m.id,
          role: m.role as OrgRole,
          user_id: m.user_id,
          full_name: profile?.full_name ?? null,
          isSelf: user?.id === m.user_id,
        };
      });
      invites = (inviteData ?? []).map((i) => ({
        id: i.id,
        email: i.email,
        role: i.role as OrgRole,
        status: i.status,
        expires_at: i.expires_at,
      }));
      activeGoals = (goalData ?? []).map((g) => g.goal_key);
      myRole = (myMembership?.role as OrgRole) || null;
    } catch {
      // keep defaults
    }
  }

  return (
    <div className="jacita-page jacita-enter max-w-3xl space-y-6">
      <div>
        <p className="jacita-label">Brand</p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          Business Settings
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Profile and brand for {active?.name ?? "your business"}
        </p>
      </div>

      {!org ? (
        <p className="text-sm text-muted-foreground">
          Create or select a business to edit settings.
        </p>
      ) : (
        <>
          <SettingsNav current={section} />

          {section === "business" || section === "brand" ? (
            <SettingsForm
              organisation={org}
              brand={brand}
              section={section === "brand" ? "brand" : "business"}
            />
          ) : null}

          {section === "services" ? (
            <section className="space-y-4">
              <ServiceForm organisationId={org.id} />
              <ServiceList organisationId={org.id} services={services} />
            </section>
          ) : null}

          {section === "audience" ? (
            <section className="jacita-panel space-y-3 rounded-2xl p-5 sm:p-6">
              <h2 className="font-heading text-lg font-semibold">Audience</h2>
              <p className="text-sm text-muted-foreground">
                Ideal customer:{" "}
                {audience?.ideal_customer_description ||
                  brand.target_audience ||
                  "Not set yet"}
              </p>
              <ButtonLink href="/app/onboarding/setup?step=audience">
                Edit audience
              </ButtonLink>
            </section>
          ) : null}

          {section === "goals" ? (
            <section className="jacita-panel space-y-3 rounded-2xl p-5 sm:p-6">
              <h2 className="font-heading text-lg font-semibold">
                Marketing goals
              </h2>
              <p className="text-sm text-muted-foreground">
                Primary:{" "}
                {MARKETING_GOALS.find(
                  (g) => g.key === org.primary_marketing_goal_key
                )?.label || "Not set"}
              </p>
              <ul className="text-sm text-muted-foreground">
                {activeGoals.map((g) => (
                  <li key={g}>
                    {MARKETING_GOALS.find((x) => x.key === g)?.label || g}
                  </li>
                ))}
              </ul>
              <ButtonLink href="/app/onboarding/setup?step=goals">
                Edit goals
              </ButtonLink>
            </section>
          ) : null}

          {section === "social" ? (
            <SocialAccountsPanel
              organisationId={org.id}
              organisationName={org.name}
              accounts={socialAccounts}
            />
          ) : null}

          {section === "team" ? (
            <TeamPanel
              organisationId={org.id}
              members={members}
              invites={invites}
              canManage={myRole === "owner"}
            />
          ) : null}

          {section === "publishing" ? (
            <PublishingModePanel
              organisationId={org.id}
              mode={org.autopilot_mode}
            />
          ) : null}

          {section === "danger" ? (
            <DangerZone
              organisationId={org.id}
              organisationName={org.name}
              canDelete={myRole === "owner"}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function ButtonLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm font-medium hover:bg-muted"
    >
      {children}
    </Link>
  );
}
