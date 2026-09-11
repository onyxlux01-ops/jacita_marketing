import Link from "next/link";
import { Suspense } from "react";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/content/status-badge";
import { PlatformIcons } from "@/components/content/platform-icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { ContentStatus, SocialPlatform } from "@/lib/types";
import { ContentFilters } from "./content-filters";
import { cn } from "@/lib/utils";

const STATUSES: Array<ContentStatus | "all"> = [
  "all",
  "draft",
  "review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
];

const FILTER_TABS: Array<{ id: ContentStatus | "all"; label: string }> = [
  { id: "all", label: "All content" },
  { id: "draft", label: "Drafts" },
  { id: "review", label: "Needs approval" },
  { id: "approved", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "publishing", label: "Publishing" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
];

export default async function ContentListPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    platform?: string;
    type?: string;
    service?: string;
    campaign?: string;
  }>;
}) {
  const params = await searchParams;
  const statusFilter =
    params.status && STATUSES.includes(params.status as ContentStatus | "all")
      ? (params.status as ContentStatus | "all")
      : "all";

  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  let items: Array<{
    id: string;
    title: string | null;
    status: ContentStatus;
    content_type: string | null;
    updated_at: string;
    caption: string | null;
    hook: string | null;
    platforms: SocialPlatform[];
    product_service_id: string | null;
    campaign_id: string | null;
  }> = [];
  let services: Array<{ id: string; name: string }> = [];
  let campaigns: Array<{ id: string; name: string }> = [];

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const [{ data: serviceData }, { data: campaignData }] = await Promise.all([
        supabase
          .from("products_services")
          .select("id, name")
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .order("name")
          .limit(40),
        supabase
          .from("campaigns")
          .select("id, name")
          .eq("organisation_id", active.id)
          .order("created_at", { ascending: false })
          .limit(40),
      ]);
      services = serviceData ?? [];
      campaigns = campaignData ?? [];

      let query = supabase
        .from("content")
        .select(
          "id, title, status, content_type, updated_at, caption, hook, product_service_id, campaign_id, content_platforms(platform)"
        )
        .eq("organisation_id", active.id)
        .order("updated_at", { ascending: false });

      if (statusFilter !== "all") query = query.eq("status", statusFilter);
      if (params.type) query = query.eq("content_type", params.type);
      if (params.service) query = query.eq("product_service_id", params.service);
      if (params.campaign) query = query.eq("campaign_id", params.campaign);
      if (params.q) {
        query = query.or(
          `title.ilike.%${params.q}%,caption.ilike.%${params.q}%,hook.ilike.%${params.q}%`
        );
      }

      const { data } = await query;
      items =
        (data ?? [])
          .map((row) => {
            const platformsRaw = (
              row as {
                content_platforms?: Array<{ platform: SocialPlatform }> | null;
              }
            ).content_platforms;
            const platforms = (platformsRaw ?? []).map((p) => p.platform);
            if (
              params.platform &&
              !platforms.includes(params.platform as SocialPlatform)
            ) {
              return null;
            }
            return {
              id: row.id,
              title: row.title,
              status: row.status as ContentStatus,
              content_type: row.content_type,
              updated_at: row.updated_at,
              caption: row.caption,
              hook: row.hook,
              platforms,
              product_service_id: row.product_service_id,
              campaign_id: row.campaign_id,
            };
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x)) ?? [];
    } catch {
      items = [];
    }
  }

  return (
    <div className="jacita-page jacita-enter">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="jacita-label">Workspace</p>
          <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
            Content
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Library and approvals for {active?.name ?? "your business"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/app/content/series">Series</Link>
          </Button>
          <Button asChild className="rounded-lg">
            <Link href="/app/content/new">
              <Plus className="size-4" />
              Create content
            </Link>
          </Button>
        </div>
      </header>

      <Suspense fallback={<Skeleton className="h-9 w-full max-w-xl rounded-lg" />}>
        <ContentFilters
          current={statusFilter}
          tabs={FILTER_TABS}
          services={services}
          campaigns={campaigns}
        />
      </Suspense>

      {items.length === 0 ? (
        <EmptyState
          title="No content yet"
          description="Open the Content Studio and tell Jacita what you want to achieve."
          action={
            <Button asChild>
              <Link href="/app/content/new">Open Content Studio</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <Link
              key={item.id}
              href={`/app/content/${item.id}`}
              className={cn(
                "group flex flex-col overflow-hidden rounded-xl border border-border/60 bg-card transition-transform duration-200 hover:-translate-y-0.5",
                index < 3 && "jacita-enter",
                index === 1 && "jacita-enter-delay-1",
                index === 2 && "jacita-enter-delay-2"
              )}
            >
              <div className="relative aspect-[4/5] bg-gradient-to-br from-[#d7e4e1] via-[#eef2f1] to-[#c5d4d0]">
                <div className="absolute inset-0 flex items-end p-4">
                  <p className="line-clamp-3 text-sm font-medium text-foreground/90">
                    {item.hook || item.caption || "Untitled draft"}
                  </p>
                </div>
                <div className="absolute top-3 left-3">
                  <PlatformIcons platforms={item.platforms} />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-heading text-[15px] font-semibold">
                      {item.title || "Untitled content"}
                    </p>
                    <p className="mt-1 text-xs capitalize text-muted-foreground">
                      {(item.content_type || "post").replaceAll("_", " ")}
                    </p>
                  </div>
                  <StatusBadge status={item.status} />
                </div>
                <p className="line-clamp-2 text-sm text-muted-foreground">
                  {item.caption || "No caption yet — open to edit."}
                </p>
                <p className="mt-auto font-mono text-[11px] text-muted-foreground">
                  Updated {new Date(item.updated_at).toLocaleDateString()}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
