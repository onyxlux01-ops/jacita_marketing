import { ImageIcon, Search } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { MediaUploadForm } from "./upload-form";
import { AiFlyerForm } from "./flyer-form";
import { MediaAssetActions } from "./media-actions";
import { MediaCategoryTabs } from "./media-category-tabs";
import { Input } from "@/components/ui/input";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

const CATEGORIES = [
  "All",
  "Images",
  "Videos",
  "Before & After",
  "Services",
  "Promotions",
  "Staff",
  "Other",
] as const;

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; q?: string }>;
}) {
  const { category: categoryParam, q } = await searchParams;
  const category =
    CATEGORIES.find((c) => c === categoryParam) ?? ("All" as const);

  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);

  let assets: Array<{
    id: string;
    file_url: string | null;
    thumbnail_url: string | null;
    media_type: string;
    description: string | null;
    storage_path: string;
    category: string | null;
    is_favourite: boolean;
  }> = [];
  let services: Array<{ id: string; name: string }> = [];

  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const [{ data }, { data: servicesData }] = await Promise.all([
        supabase
          .from("media_assets")
          .select(
            "id, file_url, thumbnail_url, media_type, description, storage_path, category, is_favourite"
          )
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .order("created_at", { ascending: false }),
        supabase
          .from("products_services")
          .select("id, name")
          .eq("organisation_id", active.id)
          .eq("is_active", true)
          .order("name"),
      ]);

      services = servicesData ?? [];
      const rows = data ?? [];
      assets = await Promise.all(
        rows.map(async (asset) => {
          const { data: signed } = await supabase.storage
            .from("media")
            .createSignedUrl(asset.storage_path, 60 * 60);
          return {
            ...asset,
            file_url: signed?.signedUrl ?? null,
          };
        })
      );
    } catch {
      assets = [];
    }
  }

  const filtered = assets.filter((asset) => {
    if (category === "Images" && asset.media_type !== "image") return false;
    if (category === "Videos" && asset.media_type !== "video") return false;
    if (
      category !== "All" &&
      category !== "Images" &&
      category !== "Videos"
    ) {
      const key = category.toLowerCase();
      if (!(asset.category || "").toLowerCase().includes(key.split(" ")[0])) {
        if (asset.category) return false;
      }
    }
    if (q) {
      const hay = `${asset.description || ""} ${asset.category || ""}`.toLowerCase();
      if (!hay.includes(q.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="jacita-page jacita-enter max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="jacita-label">Library</p>
          <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
            Media
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Visual assets for {active?.name ?? "your business"}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <MediaCategoryTabs categories={CATEGORIES} current={category} />
        <form className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search media"
            className="rounded-full pl-9"
          />
        </form>
      </div>

      {active ? (
        <div className="space-y-4">
          <div className="jacita-panel rounded-2xl p-4 sm:p-5">
            <p className="mb-3 text-sm font-medium">Upload</p>
            <MediaUploadForm organisationId={active.id} />
          </div>
          <div className="jacita-panel rounded-2xl p-4 sm:p-5">
            <AiFlyerForm organisationId={active.id} services={services} />
          </div>
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title="Media library is empty"
          description="Upload brand photos and video clips to reuse across AI-generated posts."
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {filtered.map((asset) => (
            <figure
              key={asset.id}
              className="group overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(15,18,24,0.04)]"
            >
              <div className="aspect-square overflow-hidden bg-muted">
                {asset.media_type === "image" && asset.file_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={asset.file_url}
                    alt={asset.description || ""}
                    className="size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                  />
                ) : asset.media_type === "video" && asset.file_url ? (
                  <video
                    src={asset.file_url}
                    className="size-full object-cover"
                    muted
                    playsInline
                    preload="metadata"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
                    {asset.media_type}
                  </div>
                )}
              </div>
              <figcaption className="flex items-start justify-between gap-2 p-3">
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-medium">
                    {asset.description || "Untitled asset"}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {asset.category || asset.media_type}
                  </p>
                </div>
                <MediaAssetActions
                  mediaId={asset.id}
                  isFavourite={asset.is_favourite}
                />
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
