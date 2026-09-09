import Link from "next/link";
import { SeriesForm } from "./series-form";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";

export default async function ContentSeriesPage() {
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  let series: Array<{
    id: string;
    name: string;
    description: string | null;
    frequency: string;
    preferred_platform: string | null;
    content_rules: string | null;
    is_active: boolean;
  }> = [];

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("content_series")
        .select(
          "id, name, description, frequency, preferred_platform, content_rules, is_active"
        )
        .eq("organisation_id", active.id)
        .order("created_at", { ascending: false });
      series = data ?? [];
    } catch {
      series = [];
    }
  }

  return (
    <div className="jacita-page jacita-enter max-w-3xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="jacita-label">Content studio</p>
          <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
            Content series
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Recurring formats like Tip Tuesday or Transformation Friday for{" "}
            {active?.name ?? "your business"}.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/app/content/new">Open studio</Link>
        </Button>
      </header>

      {active ? <SeriesForm organisationId={active.id} /> : null}

      <ul className="space-y-3">
        {series.map((s) => (
          <li key={s.id} className="jacita-panel rounded-xl p-4">
            <p className="font-heading font-semibold">{s.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {s.frequency}
              {s.preferred_platform ? ` · ${s.preferred_platform}` : ""}
              {!s.is_active ? " · paused" : ""}
            </p>
            {s.description ? (
              <p className="mt-2 text-sm">{s.description}</p>
            ) : null}
            {s.content_rules ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Rules: {s.content_rules}
              </p>
            ) : null}
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link
                href={`/app/content/new?notes=${encodeURIComponent(
                  `Create the next post for the series “${s.name}”. ${s.content_rules || ""}`
                )}`}
              >
                Generate next post
              </Link>
            </Button>
          </li>
        ))}
        {!series.length ? (
          <p className="text-sm text-muted-foreground">
            No series yet — create one to unlock recurring AI posts.
          </p>
        ) : null}
      </ul>
    </div>
  );
}
