import Link from "next/link";
import { AutomationSetupWizard } from "@/components/automation/automation-setup-wizard";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { Button } from "@/components/ui/button";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import {
  ensureAutomationSettings,
  getOrgSetupReadiness,
} from "@/lib/automation";
import {
  getActiveOrganisation,
  getUserOrganisations,
} from "@/lib/org";

export default async function AutomationSetupPage() {
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  if (!active || !hasSupabaseEnv()) {
    return (
      <div className="jacita-page max-w-2xl">
        <h1 className="font-heading text-2xl font-semibold">Setup</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a business first.
        </p>
      </div>
    );
  }

  const admin = createAdminClient();
  await ensureAutomationSettings(admin, active.id);
  const readiness = await getOrgSetupReadiness(admin, active.id);

  return (
    <div className="jacita-page jacita-enter max-w-2xl space-y-8">
      <header>
        <div className="hidden lg:block">
          <BusinessSwitcher organisations={orgs} active={active} variant="page" />
        </div>
        <h1 className="mt-3 font-heading text-2xl font-semibold tracking-tight">
          Automation setup
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Eight steps to turn on AI marketing for {active.name}.
        </p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/app/automation">Skip to controls</Link>
        </Button>
      </header>

      <AutomationSetupWizard
        organisationId={active.id}
        businessName={active.name}
        readiness={readiness}
      />
    </div>
  );
}
