import { Briefcase } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ServiceForm } from "./service-form";
import { ServiceList } from "./service-list";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

export default async function ServicesPage() {
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

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

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const { data } = await supabase
        .from("products_services")
        .select(
          "id, name, description, category, price, duration_minutes, target_audience, is_featured, is_promotion, is_active"
        )
        .eq("organisation_id", active.id)
        .order("name");
      services = data ?? [];
    } catch {
      services = [];
    }
  }

  return (
    <div className="jacita-page jacita-enter">
      <header>
        <p className="jacita-label">Catalogue</p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          Services
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Products and services used in AI content for{" "}
          {active?.name ?? "your business"}
        </p>
      </header>

      {active ? (
        <section className="jacita-panel rounded-2xl p-5 sm:p-6">
          <p className="jacita-label">Add</p>
          <h2 className="mt-2 font-heading text-lg font-semibold">
            New service or product
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Offerings Jacita can promote in captions and campaigns.
          </p>
          <div className="mt-5">
            <ServiceForm organisationId={active.id} />
          </div>
        </section>
      ) : null}

      {services.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No services yet"
          description="Add products or services so Jacita can write specific, useful posts."
          exampleHint='e.g. "Signature fade" or "Weekend brunch set".'
        />
      ) : active ? (
        <section className="jacita-panel overflow-hidden rounded-2xl">
          <div className="border-b border-border/60 px-5 py-4 sm:px-6">
            <h2 className="font-heading text-lg font-semibold">Catalogue</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {services.length} item{services.length === 1 ? "" : "s"}
            </p>
          </div>
          <ServiceList organisationId={active.id} services={services} />
        </section>
      ) : null}
    </div>
  );
}
