import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { GenerateContentForm } from "./generate-form";

export default async function NewContentPage({
  searchParams,
}: {
  searchParams: Promise<{ notes?: string; intent?: string; goal?: string }>;
}) {
  const { notes, intent, goal } = await searchParams;
  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  let services: Array<{ id: string; name: string }> = [];
  let media: Array<{
    id: string;
    file_url: string | null;
    description: string | null;
    category?: string | null;
    media_type?: string | null;
  }> = [];
  let campaigns: Array<{ id: string; name: string }> = [];
  let series: Array<{ id: string; name: string }> = [];

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const [
        { data: servicesData },
        { data: mediaData },
        { data: campaignsData },
        { data: seriesData },
      ] = await Promise.all([
        supabase
          .from("products_services")
          .select("id, name")
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("media_assets")
          .select("id, file_url, description, storage_path, category, media_type")
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(40),
        supabase
          .from("campaigns")
          .select("id, name")
          .eq("organisation_id", active.id)
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("content_series")
          .select("id, name")
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .order("name")
          .limit(20),
      ]);
      services = servicesData ?? [];
      campaigns = campaignsData ?? [];
      series = seriesData ?? [];
      const rows = mediaData ?? [];
      media = await Promise.all(
        rows.map(async (asset) => {
          const { data: signed } = await supabase.storage
            .from("media")
            .createSignedUrl(asset.storage_path, 60 * 60);
          return {
            id: asset.id,
            description: asset.description,
            category: asset.category,
            media_type: asset.media_type,
            file_url: signed?.signedUrl ?? asset.file_url,
          };
        })
      );
    } catch {
      // empty
    }
  }

  const intentNotes: Record<string, string> = {
    week: "Create a full week of on-brand social content.",
    promote: "Promote a service or product this week.",
    growth: "Grow social following with engaging content.",
    bookings: "Drive more bookings and fill quiet days.",
  };

  const intentGoals: Record<string, string> = {
    week: "increase_engagement",
    promote: "promote_service",
    growth: "increase_followers",
    bookings: "increase_bookings",
  };

  const initialNotes =
    notes?.trim() ||
    (intent && intentNotes[intent] ? intentNotes[intent] : "");

  const initialGoal =
    goal?.trim() ||
    (intent && intentGoals[intent] ? intentGoals[intent] : "");

  return (
    <div className="jacita-page jacita-enter max-w-7xl">
      <header>
        <p className="jacita-label">Content studio</p>
        <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
          Create content
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Tell Jacita what you want to achieve for{" "}
          {active?.name ?? "your business"} — then review, edit, approve, and
          schedule.
        </p>
      </header>
      <GenerateContentForm
        organisationId={active?.id ?? ""}
        organisationName={active?.name ?? ""}
        services={services}
        media={media}
        campaigns={campaigns}
        series={series}
        initialNotes={initialNotes}
        initialGoal={initialGoal}
      />
    </div>
  );
}
