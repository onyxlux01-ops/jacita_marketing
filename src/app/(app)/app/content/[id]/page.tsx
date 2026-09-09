import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { StatusBadge } from "@/components/content/status-badge";
import { PlatformIcons } from "@/components/content/platform-icons";
import { SocialPreview } from "@/components/content/social-preview";
import { ContentWorkflow } from "./workflow-actions";
import { ContentEditor } from "./content-editor";
import {
  PlatformPublishPanel,
  type PlatformRow,
} from "./platform-publish-panel";
import { Button } from "@/components/ui/button";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { ContentStatus, SocialPlatform } from "@/lib/types";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!hasSupabaseEnv()) {
    return (
      <div className="jacita-page">
        <p className="text-sm text-muted-foreground">
          Configure Supabase to load content details.
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("content")
    .select(
      "*, content_platforms(id, platform, publish_status, scheduled_at, published_at, external_post_id, error_message, social_account_id, caption_override, hook_override)"
    )
    .eq("id", id)
    .maybeSingle();

  if (!item) notFound();

  const [{ data: events }, { data: org }] = await Promise.all([
    supabase
      .from("content_events")
      .select("id, event_type, summary, created_at")
      .eq("content_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("organisations")
      .select("name")
      .eq("id", item.organisation_id)
      .maybeSingle(),
  ]);

  let mediaUrl: string | null = null;
  if (item.media_asset_id) {
    const { data: mediaRow } = await supabase
      .from("media_assets")
      .select("storage_path")
      .eq("id", item.media_asset_id)
      .maybeSingle();
    if (mediaRow?.storage_path) {
      const { data: signed } = await supabase.storage
        .from("media")
        .createSignedUrl(mediaRow.storage_path, 60 * 60);
      mediaUrl = signed?.signedUrl ?? null;
    }
  }

  const platformRowsRaw = (
    item as {
      content_platforms?: Array<{
        id: string;
        platform: SocialPlatform;
        publish_status?: string;
        scheduled_at?: string | null;
        published_at?: string | null;
        external_post_id?: string | null;
        error_message?: string | null;
        social_account_id?: string | null;
      }>;
    }
  ).content_platforms ?? [];

  const { data: allOrgAccounts } = await supabase
    .from("social_accounts")
    .select("id, platform, account_handle, account_name, connection_status")
    .eq("organisation_id", item.organisation_id);

  const accountById = Object.fromEntries(
    (allOrgAccounts ?? []).map((a) => [a.id, a])
  );
  const accountByPlatform = Object.fromEntries(
    (allOrgAccounts ?? []).map((a) => [a.platform, a])
  );

  const platformRows: PlatformRow[] = platformRowsRaw.map((p) => {
    const linked =
      (p.social_account_id && accountById[p.social_account_id]) ||
      accountByPlatform[p.platform] ||
      null;
    return {
      id: p.id,
      platform: p.platform,
      publish_status: p.publish_status ?? "draft",
      scheduled_at: p.scheduled_at ?? null,
      published_at: p.published_at ?? null,
      external_post_id: p.external_post_id ?? null,
      error_message: p.error_message ?? null,
      social_account_id: p.social_account_id ?? linked?.id ?? null,
      account_handle: linked?.account_handle ?? null,
      account_name: linked?.account_name ?? null,
      connection_status: linked?.connection_status ?? null,
    };
  });

  const platforms = platformRows.map((p) => p.platform);
  const disconnectedScheduled = platformRows.filter(
    (p) =>
      (p.publish_status === "scheduled" || item.status === "scheduled") &&
      p.connection_status !== "connected"
  );

  const tags =
    Array.isArray(item.hashtags) && item.hashtags.length > 0
      ? item.hashtags
          .map((h: string) => (h.startsWith("#") ? h : `#${h}`))
          .join(" ")
      : "";

  const itemExt = item as typeof item & {
    on_screen_text?: string | null;
    voiceover_script?: string | null;
    alt_text?: string | null;
    posting_recommendation?: string | null;
    quality_score?: number | null;
  };

  return (
    <div className="jacita-page jacita-enter max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/app/content">
              <ArrowLeft className="size-4" />
              Back
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-heading text-2xl font-semibold tracking-tight">
              {item.title || "Untitled content"}
            </h1>
            <StatusBadge status={item.status as ContentStatus} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <PlatformIcons platforms={platforms} />
            <p className="text-sm text-muted-foreground">
              Updated {new Date(item.updated_at).toLocaleString()}
              {itemExt.quality_score != null
                ? ` · Quality ${itemExt.quality_score}/100`
                : ""}
            </p>
          </div>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link
            href={`/app/content/new?notes=${encodeURIComponent(
              `Repurpose: ${item.title || item.hook || "this post"}`
            )}`}
          >
            Repurpose in studio
          </Link>
        </Button>
      </div>

      {disconnectedScheduled.length > 0 ? (
        <div className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          A scheduled platform cannot publish because the social account is
          disconnected.{" "}
          <Link href="/app/social" className="underline">
            Reconnect accounts
          </Link>
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-6">
          <section className="jacita-panel rounded-2xl p-5 sm:p-6">
            <p className="jacita-label">Workflow</p>
            <h2 className="mt-2 font-heading text-lg font-semibold">Status</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Draft → review → approved → scheduled → publishing → published
            </p>
            <div className="mt-5">
              <ContentWorkflow
                contentId={item.id}
                organisationId={item.organisation_id}
                status={item.status as ContentStatus}
                scheduledAt={item.scheduled_at}
              />
            </div>
          </section>

          <ContentEditor
            contentId={item.id}
            organisationId={item.organisation_id}
            initial={{
              title: item.title,
              hook: item.hook,
              caption: item.caption,
              call_to_action: item.call_to_action,
              hashtags: item.hashtags,
              video_concept: item.video_concept,
              on_screen_text: itemExt.on_screen_text ?? null,
              voiceover_script: itemExt.voiceover_script ?? null,
              alt_text: itemExt.alt_text ?? null,
              posting_recommendation: itemExt.posting_recommendation ?? null,
              scheduled_at: item.scheduled_at,
            }}
          />

          <section className="jacita-panel rounded-2xl p-5 sm:p-6">
            <p className="jacita-label">Platforms</p>
            <h2 className="mt-2 font-heading text-lg font-semibold">
              Per-platform publishing
            </h2>
            <div className="mt-5">
              <PlatformPublishPanel contentId={item.id} rows={platformRows} />
            </div>
          </section>

          <section className="jacita-panel space-y-3 rounded-2xl p-5 sm:p-6">
            <p className="jacita-label">History</p>
            <h2 className="mt-1 font-heading text-lg font-semibold">
              Content timeline
            </h2>
            {(events ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">No events yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {(events ?? []).map((e) => (
                  <li
                    key={e.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border/50 pb-2"
                  >
                    <span>
                      <span className="font-medium capitalize">
                        {e.event_type.replace(/_/g, " ")}
                      </span>
                      {e.summary ? (
                        <span className="text-muted-foreground">
                          {" "}
                          — {e.summary}
                        </span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {new Date(e.created_at).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <p className="jacita-label mb-3">Preview</p>
          <SocialPreview
            platform={platforms[0] || "instagram"}
            businessName={org?.name || "Business"}
            caption={item.caption || undefined}
            hook={item.hook || undefined}
            hashtags={item.hashtags || []}
            mediaUrl={mediaUrl}
            onScreenText={itemExt.on_screen_text}
          />
          {tags ? (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {tags}
            </p>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
