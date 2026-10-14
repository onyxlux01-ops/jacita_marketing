"use server";

import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { Database, Json, SocialPlatform } from "@/lib/database.types";
import type { ContentStatus } from "@/lib/types";
import { upcomingScheduleTime } from "@/lib/social/scheduler";

async function getAuthed() {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" as const };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

async function assertMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string
) {
  const { data } = await supabase
    .from("organisation_members")
    .select("id, role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function logContentEvent(input: {
  organisationId: string;
  contentId: string;
  eventType: string;
  summary?: string;
  metadata?: Json;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  const membership = await assertMember(
    auth.supabase,
    auth.user.id,
    input.organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  await auth.supabase.from("content_events").insert({
    organisation_id: input.organisationId,
    content_id: input.contentId,
    event_type: input.eventType,
    actor_id: auth.user.id,
    summary: input.summary ?? null,
    metadata: input.metadata ?? {},
  });
  return { success: true };
}

export async function saveContentPackage(payload: {
  organisation_id: string;
  campaign_id?: string | null;
  product_service_id?: string | null;
  series_id?: string | null;
  media_asset_id?: string | null;
  parent_content_id?: string | null;
  title?: string | null;
  idea?: string | null;
  hook?: string | null;
  caption?: string | null;
  call_to_action?: string | null;
  hashtags?: string[];
  suggested_posting_time?: string | null;
  video_concept?: string | null;
  on_screen_text?: string | null;
  voiceover_script?: string | null;
  alt_text?: string | null;
  posting_recommendation?: string | null;
  content_type?: string | null;
  marketing_objective?: string | null;
  tone?: string | null;
  quality_score?: number | null;
  quality_flags?: Json;
  platforms?: SocialPlatform[];
  platform_versions?: Array<{
    platform: SocialPlatform;
    hook?: string;
    caption?: string;
    call_to_action?: string;
    hashtags?: string[];
  }>;
  generation_payload?: Json;
  status?: ContentStatus;
  scheduled_at?: string | null;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const membership = await assertMember(
    auth.supabase,
    auth.user.id,
    payload.organisation_id
  );
  if (!membership) return { error: "Unauthorized for this business" };

  const status = payload.status ?? "draft";
  let scheduledAt = payload.scheduled_at ?? null;
  if (status === "scheduled") {
    // The studio's time is the AI-suggested one (implicit): one that has
    // passed becomes "soon" rather than being refused by the scheduler.
    scheduledAt = upcomingScheduleTime(
      payload.scheduled_at || payload.suggested_posting_time
    );
  }

  // Never auto-publish
  if (status === "published" || status === "publishing") {
    return { error: "Generated content must be reviewed before publishing." };
  }

  const primaryPlatform = payload.platforms?.[0];
  const primaryVersion = payload.platform_versions?.find(
    (v) => v.platform === primaryPlatform
  );

  const { data, error } = await auth.supabase
    .from("content")
    .insert({
      organisation_id: payload.organisation_id,
      campaign_id: payload.campaign_id || null,
      product_service_id: payload.product_service_id || null,
      series_id: payload.series_id || null,
      media_asset_id: payload.media_asset_id || null,
      parent_content_id: payload.parent_content_id || null,
      title: payload.title || null,
      idea: payload.idea || null,
      hook: primaryVersion?.hook || payload.hook || null,
      caption: primaryVersion?.caption || payload.caption || null,
      call_to_action:
        primaryVersion?.call_to_action || payload.call_to_action || null,
      hashtags: primaryVersion?.hashtags || payload.hashtags || [],
      suggested_posting_time: payload.suggested_posting_time || null,
      video_concept: payload.video_concept || null,
      on_screen_text: payload.on_screen_text || null,
      voiceover_script: payload.voiceover_script || null,
      alt_text: payload.alt_text || null,
      posting_recommendation: payload.posting_recommendation || null,
      content_type: payload.content_type || null,
      marketing_objective: payload.marketing_objective || null,
      tone: payload.tone || null,
      quality_score: payload.quality_score ?? null,
      quality_flags: payload.quality_flags ?? [],
      // "scheduled" is only true once jobs are queued: save as approved and
      // let scheduleContentPublishing move it to scheduled (or report why not).
      status: status === "scheduled" ? "approved" : status,
      scheduled_at: scheduledAt,
      generation_payload: payload.generation_payload ?? null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  if (!data?.id) return { error: "Could not save content" };

  const platforms =
    payload.platform_versions?.map((v) => v.platform) ||
    payload.platforms ||
    [];

  if (platforms.length) {
    await auth.supabase.from("content_platforms").insert(
      platforms.map((platform) => {
        const version = payload.platform_versions?.find(
          (v) => v.platform === platform
        );
        return {
          content_id: data.id,
          platform,
          caption_override: version?.caption ?? null,
          hook_override: version?.hook ?? null,
          cta_override: version?.call_to_action ?? null,
          hashtags_override: version?.hashtags ?? null,
        };
      })
    );
  }

  const tags = primaryVersion?.hashtags || payload.hashtags || [];
  if (tags.length) {
    await auth.supabase.from("content_tags").insert(
      tags
        .map((tag) => tag.replace(/^#/, "").trim())
        .filter(Boolean)
        .slice(0, 20)
        .map((tag) => ({ content_id: data.id, tag }))
    );
  }

  if (payload.media_asset_id) {
    const { data: media } = await auth.supabase
      .from("media_assets")
      .select("usage_count")
      .eq("id", payload.media_asset_id)
      .eq("organisation_id", payload.organisation_id)
      .maybeSingle();
    if (media) {
      await auth.supabase
        .from("media_assets")
        .update({ usage_count: (media.usage_count || 0) + 1 })
        .eq("id", payload.media_asset_id);
    }
  }

  await auth.supabase.from("content_events").insert({
    organisation_id: payload.organisation_id,
    content_id: data.id,
    event_type: "created",
    actor_id: auth.user.id,
    summary: "Content package saved as draft",
    metadata: {
      platforms,
      content_type: payload.content_type,
      quality_score: payload.quality_score,
    },
  });

  if (status === "review" || status === "approved" || status === "scheduled") {
    await auth.supabase.from("content_events").insert({
      organisation_id: payload.organisation_id,
      content_id: data.id,
      event_type:
        status === "review"
          ? "sent_to_review"
          : status === "approved"
            ? "approved"
            : "scheduled",
      actor_id: auth.user.id,
      summary: `Status set to ${status}`,
    });
  }

  if (status === "scheduled" && scheduledAt) {
    const { scheduleContentPublishing } = await import(
      "@/app/(app)/app/actions/social"
    );
    const scheduled = await scheduleContentPublishing({
      contentId: data.id,
      organisationId: payload.organisation_id,
      scheduledAt,
    });
    if ("error" in scheduled && scheduled.error) {
      revalidatePath("/app/content");
      return {
        error: `Saved as approved, but it was not scheduled: ${scheduled.error}`,
        id: data.id,
      };
    }
  }

  revalidatePath("/app/content");
  revalidatePath("/app/calendar");
  return { success: true, id: data.id };
}

/**
 * Copy / media fields the editor may change. Deliberately NOT scheduled_at
 * or status: rescheduling goes through scheduleContentPublishing (the
 * schedule_content RPC), which moves the queued jobs with the post.
 */
const EDITABLE_CONTENT_FIELDS = [
  "title",
  "hook",
  "caption",
  "call_to_action",
  "hashtags",
  "video_concept",
  "on_screen_text",
  "voiceover_script",
  "alt_text",
  "posting_recommendation",
  "media_asset_id",
  "tone",
] as const;
type EditableContentField = (typeof EDITABLE_CONTENT_FIELDS)[number];

const APPROVED_STATES: ContentStatus[] = ["approved", "scheduled", "failed"];

export async function updateContentFields(input: {
  contentId: string;
  organisationId: string;
  fields: {
    title?: string | null;
    hook?: string | null;
    caption?: string | null;
    call_to_action?: string | null;
    hashtags?: string[];
    video_concept?: string | null;
    on_screen_text?: string | null;
    voiceover_script?: string | null;
    alt_text?: string | null;
    posting_recommendation?: string | null;
    media_asset_id?: string | null;
    tone?: string | null;
  };
  silent?: boolean;
}): Promise<
  | { error: string; success?: undefined }
  | { success: true; error?: undefined; status: ContentStatus; movedToReview: boolean }
> {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error ?? "Not authenticated" };

  const membership = await assertMember(
    auth.supabase,
    auth.user.id,
    input.organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  const { data: existing } = await auth.supabase
    .from("content")
    .select("id, organisation_id, status")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!existing) return { error: "Content not found" };

  // Server actions accept any JSON: copy only the allowed keys.
  const raw = (input.fields ?? {}) as Record<string, unknown>;
  const updates: Partial<Record<EditableContentField, unknown>> = {};
  for (const key of EDITABLE_CONTENT_FIELDS) {
    if (raw[key] !== undefined) updates[key] = raw[key];
  }
  if ("scheduled_at" in raw || "status" in raw) {
    return {
      error:
        "Change the schedule or status from the Workflow panel, not the editor.",
    };
  }
  if (!Object.keys(updates).length) {
    return {
      success: true,
      status: existing.status as ContentStatus,
      movedToReview: false,
    };
  }

  // A material edit to approved / scheduled / failed content is sent back to
  // review by the database (content_material_edit_guard), which also holds
  // its queued jobs; read the resulting status back.
  const { data: updated, error } = await auth.supabase
    .from("content")
    .update(updates as Database["public"]["Tables"]["content"]["Update"])
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .select("status");

  if (error) return { error: error.message };
  if (!updated?.length) {
    return { error: "You don't have permission to edit this post in its current state" };
  }

  const status = updated[0].status as ContentStatus;
  const movedToReview =
    APPROVED_STATES.includes(existing.status as ContentStatus) && status === "review";

  if (movedToReview) {
    await auth.supabase.from("content_events").insert({
      organisation_id: input.organisationId,
      content_id: input.contentId,
      event_type: "sent_to_review",
      actor_id: auth.user.id,
      summary: "Edited after approval: needs approval again; queued posts are on hold",
      metadata: { fields: Object.keys(updates), previous_status: existing.status },
    });
  } else if (!input.silent) {
    await auth.supabase.from("content_events").insert({
      organisation_id: input.organisationId,
      content_id: input.contentId,
      event_type: updates.media_asset_id !== undefined
        ? "media_changed"
        : "edited",
      actor_id: auth.user.id,
      summary: "Content updated",
      metadata: { fields: Object.keys(updates) },
    });
  }

  revalidatePath(`/app/content/${input.contentId}`);
  revalidatePath("/app/content");
  revalidatePath("/app/calendar");
  return { success: true, status, movedToReview };
}

export async function createContentSeries(input: {
  organisationId: string;
  name: string;
  description?: string;
  frequency?: string;
  preferredPlatform?: SocialPlatform | null;
  contentRules?: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  const membership = await assertMember(
    auth.supabase,
    auth.user.id,
    input.organisationId
  );
  if (!membership) return { error: "Unauthorized" };
  if (!input.name.trim()) return { error: "Series name is required" };

  const { data, error } = await auth.supabase
    .from("content_series")
    .insert({
      organisation_id: input.organisationId,
      name: input.name.trim(),
      description: input.description || null,
      frequency: input.frequency || "weekly",
      preferred_platform: input.preferredPlatform || null,
      content_rules: input.contentRules || null,
      created_by: auth.user.id,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };
  revalidatePath("/app/content");
  revalidatePath("/app/content/series");
  return { success: true, id: data.id };
}
