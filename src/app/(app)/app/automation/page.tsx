import Link from "next/link";
import { AutomationControlCentre } from "@/components/automation/control-centre";
import { PublishingReliabilityPanel } from "@/components/automation/publishing-reliability-panel";
import { MetaConnectionsPanel } from "@/components/automation/meta-connections-panel";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  ensureAutomationSettings,
  getOrgSetupReadiness,
  getAutomationStatus,
  getCurrentAIActivity,
  getWorkQueue,
  getUpcomingContent,
  getRecentlyPublished,
  getAIInsights,
  getAutomationTimeline,
  getNeedsAttention,
  getAutomationHealth,
  getApprovalQueue,
} from "@/lib/automation";
import { getPublishingDashboard } from "@/lib/social/publishing-dashboard";
import { getMetaSurfaceForOrganisation } from "@/lib/ads/service";
import { getAiProviderHealth } from "@/lib/ai";
import {
  getActiveOrganisation,
  getUserOrganisations,
} from "@/lib/org";

export default async function AutomationPage() {
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  if (!active || !hasSupabaseEnv()) {
    return (
      <div className="jacita-page max-w-3xl">
        <h1 className="font-heading text-2xl font-semibold">Automation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Select a business to open the AI marketing control centre.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  await ensureAutomationSettings(admin, active.id);

  const [
    status,
    activity,
    workQueue,
    upcoming,
    approvals,
    published,
    insights,
    timeline,
    attention,
    health,
    readiness,
    publishing,
    { data: orgTz },
    metaSurface,
    aiHealth,
  ] = await Promise.all([
    getAutomationStatus(supabase, active.id),
    getCurrentAIActivity(supabase, active.id),
    getWorkQueue(supabase, active.id),
    getUpcomingContent(supabase, active.id, 10),
    getApprovalQueue(supabase, active.id),
    getRecentlyPublished(supabase, active.id, 5),
    getAIInsights(supabase, active.id),
    getAutomationTimeline(supabase, active.id, 28),
    getNeedsAttention(supabase, active.id),
    getAutomationHealth(supabase, active.id),
    getOrgSetupReadiness(admin, active.id),
    getPublishingDashboard(supabase, active.id),
    supabase
      .from("organisations")
      .select("timezone")
      .eq("id", active.id)
      .maybeSingle(),
    getMetaSurfaceForOrganisation(active.id).catch(() => null),
    getAiProviderHealth(),
  ]);

  const attentionWithAi = aiHealth.live
    ? attention
    : [
        {
          id: "openai-provider",
          kind: "openai" as const,
          title:
            aiHealth.reason === "billing"
              ? "OpenAI needs credits"
              : "OpenAI is not live",
          detail: aiHealth.message,
          href: "https://platform.openai.com/settings/organization/billing/",
        },
        ...attention,
      ];

  return (
    <div className="jacita-page jacita-enter max-w-6xl pb-8">
      <header className="space-y-3">
        <BusinessSwitcher
          organisations={orgs}
          active={active}
          variant="page"
        />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-[1.75rem]">
              Control centre
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              What AI is doing for {active.name}, what publishes next, and when
              you are needed.
            </p>
          </div>
          <Link
            href="/app/automation/setup"
            className="text-sm font-medium text-primary hover:underline"
          >
            Setup
          </Link>
        </div>
      </header>

      <AutomationControlCentre
        businessName={active.name}
        initialStatus={status}
        initialActivity={activity}
        initialWorkQueue={workQueue}
        initialUpcoming={upcoming}
        initialApprovals={approvals}
        initialPublished={published}
        initialInsights={insights}
        initialTimeline={timeline}
        initialAttention={attentionWithAi}
        initialHealth={health}
        readiness={readiness}
        metaSurface={metaSurface}
        aiHealth={aiHealth}
      />

      {metaSurface ? (
        <div className="border-t border-border/70 pt-8">
          <MetaConnectionsPanel surface={metaSurface} />
        </div>
      ) : null}

      <div className="border-t border-border/70 pt-8">
        <PublishingReliabilityPanel
          organisationId={active.id}
          timezone={orgTz?.timezone || "Europe/London"}
          data={publishing}
        />
      </div>
    </div>
  );
}
