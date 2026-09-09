import { Megaphone } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { CampaignForm } from "./campaign-form";
import { Badge } from "@/components/ui/badge";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export default async function CampaignsPage() {
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  let campaigns: Array<{
    id: string;
    name: string;
    objective: string | null;
    description: string | null;
    status: string;
    start_date: string | null;
    end_date: string | null;
    budget: number | null;
    target_audience: string | null;
  }> = [];

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("campaigns")
        .select(
          "id, name, objective, description, status, start_date, end_date, budget, target_audience"
        )
        .eq("organisation_id", active.id)
        .order("created_at", { ascending: false });
      campaigns = data ?? [];
    } catch {
      campaigns = [];
    }
  }

  return (
    <div className="jacita-page jacita-enter">
      <header>
        <p className="jacita-label">Planning</p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          Campaigns
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Group content around goals and timelines for{" "}
          {active?.name ?? "your business"}
        </p>
      </header>

      {active ? (
        <section className="jacita-panel rounded-2xl p-5 sm:p-6">
          <p className="jacita-label">Create</p>
          <h2 className="mt-2 font-heading text-lg font-semibold">
            New campaign
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft a campaign shell — content can attach later.
          </p>
          <div className="mt-5">
            <CampaignForm organisationId={active.id} />
          </div>
        </section>
      ) : null}

      {campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No campaigns yet"
          description="Launch a campaign to organise posts around a promotion or seasonal push."
          exampleHint='Example: "Spring menu launch" or "New client offer".'
        />
      ) : (
        <ul className="space-y-3">
          {campaigns.map((c) => (
            <li
              key={c.id}
              className="jacita-panel flex flex-col gap-3 rounded-2xl px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-lg font-semibold">{c.name}</h3>
                  <Badge variant="secondary" className="capitalize">
                    {c.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {c.objective || "No objective set"}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {c.description || "No description"}
                </p>
                {(c.target_audience || c.budget != null) && (
                  <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                    {[
                      c.target_audience,
                      c.budget != null
                        ? `£${Number(c.budget).toFixed(2)}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </div>
              {(c.start_date || c.end_date) && (
                <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
                  {c.start_date ?? "—"} → {c.end_date ?? "—"}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
