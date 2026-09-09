import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSetupProgress } from "@/lib/org/setup-progress";

export default async function OnboardingCompletePage() {
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);
  if (!active || !hasSupabaseEnv()) redirect("/app/onboarding");

  const supabase = await createClient();
  const progress = await getSetupProgress(supabase, active.id);

  return (
    <div className="jacita-page jacita-enter max-w-2xl space-y-6">
      <header>
        <p className="jacita-label">Ready</p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          Your marketing workspace is ready.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {active.name} is set up. You can refine anything later in settings.
        </p>
      </header>

      <ul className="jacita-panel divide-y divide-border/70 overflow-hidden rounded-2xl">
        {(progress?.items || []).map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
          >
            <span>{item.label}</span>
            <span className="text-muted-foreground">{item.detail}</span>
          </li>
        ))}
      </ul>

      <Button asChild className="rounded-xl">
        <Link href="/app">Go to Marketing Dashboard</Link>
      </Button>
    </div>
  );
}
