import Link from "next/link";
import { Plus, Building2 } from "lucide-react";
import {
  getActiveOrganisation,
  getSessionUser,
  getUserOrganisations,
} from "@/lib/org";
import { createClient } from "@/lib/supabase/server";
import { OpenBusiness } from "@/components/dashboard/open-business";
import { Button } from "@/components/ui/button";
import { MARKETING_GOALS } from "@/lib/ai/goals";

export default async function BusinessesPage() {
  const [organisations, user] = await Promise.all([
    getUserOrganisations(),
    getSessionUser(),
  ]);
  const active = await getActiveOrganisation(organisations);
  const db = await createClient();
  const businesses = await Promise.all(
    organisations.map(async (business) => {
      const [profile, brand, accounts, media, automation] = await Promise.all([
        db
          .from("organisations")
          .select("primary_marketing_goal_key, description")
          .eq("id", business.id)
          .single(),
        db
          .from("brand_profiles")
          .select("logo_path, brand_voice, tone, custom_instructions")
          .eq("organisation_id", business.id)
          .maybeSingle(),
        db
          .from("social_accounts")
          .select("platform, connection_status")
          .eq("organisation_id", business.id),
        db
          .from("media_assets")
          .select("id", { count: "exact", head: true })
          .eq("organisation_id", business.id)
          .eq("is_active", true),
        db
          .from("automation_settings")
          .select("enabled, paused, mode")
          .eq("organisation_id", business.id)
          .maybeSingle(),
      ]);
      return {
        ...business,
        profile: profile.data,
        brand: brand.data,
        accounts: accounts.data,
        media: media.count,
        automation: automation.data,
        failed: [profile, brand, accounts, media, automation].some(
          (r) => r.error,
        ),
      };
    }),
  );
  return (
    <div className="jacita-page jacita-enter">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your client portfolio</p>
          <h1 className="mt-2 text-3xl font-semibold">Businesses</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Each business has its own brand, content, accounts and approval
            rules.
          </p>
        </div>
        {user?.is_platform_admin && (
          <Button asChild>
            <Link href="/app/onboarding">
              <Plus size={15} />
              Add business
            </Link>
          </Button>
        )}
      </header>
      <div className="business-grid">
        {businesses.map((business) => (
          <section key={business.id} className="glass-panel business-card">
            <div className="flex items-start justify-between gap-3">
              <Building2 className="mb-4 text-primary" size={22} />
              <span className="text-xs text-muted-foreground">
                {business.id === active?.id
                  ? "Selected business"
                  : business.status}
              </span>
            </div>
            <h2>{business.name}</h2>
            <p className="mt-1">
              {[business.business_category, business.location]
                .filter(Boolean)
                .join(" · ") || "Profile details needed"}
            </p>
            {business.failed ? (
              <p role="alert" className="mt-4 text-destructive">
                Some business records could not be loaded.
              </p>
            ) : (
              <dl className="health-rows">
                <div className="py-3 text-xs">
                  <dt className="text-muted-foreground">Primary goal</dt>
                  <dd className="mt-1">
                    {MARKETING_GOALS.find(
                      (g) =>
                        g.key === business.profile?.primary_marketing_goal_key,
                    )?.label || "Choose a marketing goal"}
                  </dd>
                </div>
                <div className="py-3 text-xs">
                  <dt className="text-muted-foreground">Brand & assets</dt>
                  <dd className="mt-1">
                    {business.brand?.brand_voice ||
                      business.brand?.tone ||
                      "Brand voice needed"}{" "}
                    · {business.media ?? 0} media assets
                  </dd>
                  <dd className="mt-1 text-muted-foreground">
                    {business.brand?.logo_path
                      ? "Logo uploaded"
                      : "Logo missing"}
                  </dd>
                </div>
                <div className="py-3 text-xs">
                  <dt className="text-muted-foreground">Connected accounts</dt>
                  <dd className="mt-1">
                    {business.accounts?.length
                      ? business.accounts
                          .map(
                            (a) =>
                              `${a.platform}: ${a.connection_status.replaceAll("_", " ")}`,
                          )
                          .join(" · ")
                      : "No accounts connected"}
                  </dd>
                </div>
                <div className="py-3 text-xs">
                  <dt className="text-muted-foreground">Automation</dt>
                  <dd className="mt-1 capitalize">
                    {business.automation?.paused
                      ? "Paused"
                      : business.automation?.enabled
                        ? business.automation.mode
                        : "Off"}
                  </dd>
                </div>
              </dl>
            )}
            <div className="business-links">
              <OpenBusiness id={business.id}>Open workspace</OpenBusiness>
              <OpenBusiness id={business.id} href="/app/settings">
                Profile & brand rules
              </OpenBusiness>
              <OpenBusiness id={business.id} href="/app/automation">
                Automation
              </OpenBusiness>
            </div>
          </section>
        ))}
      </div>
      {!businesses.length && (
        <section className="glass-panel p-8">
          <h2>No businesses yet</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {user?.is_platform_admin
              ? "Add your first client business to start setting up its marketing workspace."
              : "Your administrator can invite you to a client business."}
          </p>
        </section>
      )}
    </div>
  );
}
