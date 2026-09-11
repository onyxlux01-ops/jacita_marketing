"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureAutomationSettings,
  modeToOrgAutopilot,
  logAutomationActivity,
  type AutomationMode,
  type AiFreedomLevel,
} from "@/lib/automation/settings";
import {
  runAutomationForOrganisation,
  getOrgSetupReadiness,
} from "@/lib/automation/engine";
import { enqueuePublishJobsForContent } from "@/lib/social/scheduler";
import { notifyAutomationIssue } from "@/lib/automation/notify";
import type { Json } from "@/lib/database.types";

async function getAuthed() {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" as const };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

async function requireManager(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string
) {
  const { data } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !["owner", "manager"].includes(data.role)) return null;
  return data;
}

async function requireMember(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string
) {
  const { data } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

function revalidateAutomation() {
  revalidatePath("/app");
  revalidatePath("/app/automation");
  revalidatePath("/app/content");
  revalidatePath("/app/calendar");
  revalidatePath("/app/settings");
}

export async function saveAutomationSettings(input: {
  organisationId: string;
  mode?: AutomationMode;
  enabled?: boolean;
  paused?: boolean;
  postsPerWeek?: number;
  storiesPerWeek?: number;
  reelsPerWeek?: number;
  platforms?: string[];
  contentPreferences?: string[];
  primaryGoals?: string[];
  maxAutoPublishesPerDay?: number;
  pipelineHorizonDays?: number;
  aiFreedomLevel?: AiFreedomLevel;
  markSetupComplete?: boolean;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Only owners and managers can change automation" };
  }

  const admin = createAdminClient();
  await ensureAutomationSettings(admin, input.organisationId);

  const patch: {
    mode?: AutomationMode;
    enabled?: boolean;
    paused?: boolean;
    posts_per_week?: number;
    stories_per_week?: number;
    reels_per_week?: number;
    platforms?: string[];
    content_preferences?: string[];
    primary_goals?: string[];
    max_auto_publishes_per_day?: number;
    pipeline_horizon_days?: number;
    ai_freedom_level?: AiFreedomLevel;
    setup_completed_at?: string;
    current_state?: string;
  } = {};
  if (input.mode !== undefined) patch.mode = input.mode;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.paused !== undefined) patch.paused = input.paused;
  if (input.postsPerWeek !== undefined) patch.posts_per_week = input.postsPerWeek;
  if (input.storiesPerWeek !== undefined) {
    patch.stories_per_week = input.storiesPerWeek;
  }
  if (input.reelsPerWeek !== undefined) patch.reels_per_week = input.reelsPerWeek;
  if (input.platforms !== undefined) patch.platforms = input.platforms;
  if (input.contentPreferences !== undefined) {
    patch.content_preferences = input.contentPreferences;
  }
  if (input.primaryGoals !== undefined) patch.primary_goals = input.primaryGoals;
  if (input.maxAutoPublishesPerDay !== undefined) {
    patch.max_auto_publishes_per_day = input.maxAutoPublishesPerDay;
  }
  if (input.pipelineHorizonDays !== undefined) {
    patch.pipeline_horizon_days = input.pipelineHorizonDays;
  }
  if (input.aiFreedomLevel !== undefined) {
    patch.ai_freedom_level = input.aiFreedomLevel;
  }
  if (input.markSetupComplete) {
    patch.setup_completed_at = new Date().toISOString();
  }
  if (input.mode === "off") {
    patch.enabled = false;
    patch.current_state = "off";
  }
  if (input.paused === true) patch.current_state = "paused";

  const { error } = await auth.supabase
    .from("automation_settings")
    .update(patch)
    .eq("organisation_id", input.organisationId);

  if (error) return { error: error.message };

  if (input.mode && input.mode !== "off") {
    await auth.supabase
      .from("organisations")
      .update({ autopilot_mode: modeToOrgAutopilot(input.mode) })
      .eq("id", input.organisationId);
  }

  revalidateAutomation();
  return { success: true };
}

export async function changeAutomationMode(input: {
  organisationId: string;
  mode: AutomationMode;
  confirmed: boolean;
}) {
  if (!input.confirmed) {
    return { error: "Confirmation required to change automation mode" };
  }
  return saveAutomationSettings({
    organisationId: input.organisationId,
    mode: input.mode,
    enabled: input.mode !== "off",
    paused: false,
  });
}

export async function pauseAutomation(organisationId: string) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, organisationId))) {
    return { error: "Unauthorized" };
  }

  const admin = createAdminClient();
  await ensureAutomationSettings(admin, organisationId);

  const { error } = await auth.supabase
    .from("automation_settings")
    .update({
      paused: true,
      current_state: "paused",
      state_message: "Paused by you — existing schedule kept",
      next_planned_action: "Resume when you are ready",
    })
    .eq("organisation_id", organisationId);

  if (error) return { error: error.message };

  await logAutomationActivity(admin, {
    organisationId,
    eventType: "paused",
    message: "You paused AI marketing automation.",
    severity: "warning",
  });

  revalidateAutomation();
  return { success: true };
}

export async function resumeAutomation(organisationId: string) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, organisationId))) {
    return { error: "Unauthorized" };
  }

  const saved = await saveAutomationSettings({
    organisationId,
    paused: false,
    enabled: true,
  });
  if ("error" in saved && saved.error) return saved;

  // Fresh analysis on resume — do not blindly continue stale work
  const result = await runAutomationForOrganisation({
    organisationId,
    trigger: "resume",
    actorUserId: auth.user.id,
  });

  revalidateAutomation();
  return { success: true, result };
}

export async function emergencyStopAutomation(organisationId: string) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, organisationId))) {
    return { error: "Unauthorized" };
  }

  const admin = createAdminClient();
  await ensureAutomationSettings(admin, organisationId);

  await auth.supabase
    .from("automation_settings")
    .update({
      enabled: false,
      paused: true,
      mode: "off",
      current_state: "off",
      state_message: "Emergency stop — all automated activity halted",
      next_planned_action: null,
    })
    .eq("organisation_id", organisationId);

  await auth.supabase
    .from("organisations")
    .update({ autopilot_mode: "manual" })
    .eq("id", organisationId);

  // Cancel pending automation tasks
  await admin
    .from("automation_tasks")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      error_message: "Emergency stop",
    })
    .eq("organisation_id", organisationId)
    .in("status", ["pending", "running"]);

  // Cancel pending publish jobs (keep content/data)
  await admin
    .from("social_publish_jobs")
    .update({
      status: "cancelled",
      error_message: "Emergency stop",
    })
    .eq("organisation_id", organisationId)
    .eq("status", "pending");

  await admin
    .from("automation_runs")
    .update({
      status: "cancelled",
      completed_at: new Date().toISOString(),
      summary: "Emergency stop",
    })
    .eq("organisation_id", organisationId)
    .eq("status", "running");

  await logAutomationActivity(admin, {
    organisationId,
    eventType: "emergency_stop",
    message:
      "Emergency stop: generation, scheduling, and publishing halted. Data kept intact.",
    severity: "warning",
  });

  revalidateAutomation();
  return { success: true };
}

export async function startAutomation(input: {
  organisationId: string;
  mode: AutomationMode;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized" };
  }

  const admin = createAdminClient();
  const readiness = await getOrgSetupReadiness(admin, input.organisationId);
  if (!readiness.ready && input.mode !== "manual" && input.mode !== "off") {
    return {
      error:
        "Complete setup first: business, goals, services, and at least one connected social account.",
      readiness,
    };
  }

  const saved = await saveAutomationSettings({
    organisationId: input.organisationId,
    mode: input.mode,
    enabled: input.mode !== "off",
    paused: false,
    markSetupComplete: true,
  });
  if ("error" in saved && saved.error) return saved;

  if (input.mode === "off") {
    return { success: true, readiness };
  }

  const result = await runAutomationForOrganisation({
    organisationId: input.organisationId,
    trigger: "start",
    actorUserId: auth.user.id,
  });

  revalidateAutomation();
  return { success: true, result, readiness };
}

export async function runAutomationNow(organisationId: string) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, organisationId))) {
    return { error: "Unauthorized" };
  }

  const result = await runAutomationForOrganisation({
    organisationId,
    trigger: "manual",
    actorUserId: auth.user.id,
  });

  revalidateAutomation();
  return { success: true, result };
}

export async function approveContent(input: {
  organisationId: string;
  contentId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized" };
  }

  const { data: content } = await auth.supabase
    .from("content")
    .select("id, organisation_id, status, scheduled_at, suggested_posting_time")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!content) return { error: "Content not found for this business" };

  const scheduledAt =
    content.scheduled_at ||
    content.suggested_posting_time ||
    new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { error } = await auth.supabase
    .from("content")
    .update({
      status: "scheduled",
      scheduled_at: scheduledAt,
    })
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId);

  if (error) return { error: error.message };

  await enqueuePublishJobsForContent({
    contentId: input.contentId,
    organisationId: input.organisationId,
    scheduledAt,
    userId: auth.user.id,
  });

  const admin = createAdminClient();
  await logAutomationActivity(admin, {
    organisationId: input.organisationId,
    eventType: "content_approved",
    message: "You approved content — it is now in the publishing queue.",
    severity: "success",
    metadata: { content_id: input.contentId },
  });

  await auth.supabase.from("content_events").insert({
    organisation_id: input.organisationId,
    content_id: input.contentId,
    event_type: "approved",
    actor_id: auth.user.id,
    summary: "Approved from automation control centre",
  });

  revalidateAutomation();
  return { success: true };
}

export async function rejectContent(input: {
  organisationId: string;
  contentId: string;
  reason?: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized" };
  }

  const { data: content } = await auth.supabase
    .from("content")
    .select("id, organisation_id, title, hook, caption, generation_payload")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!content) return { error: "Content not found for this business" };

  const prev =
    content.generation_payload &&
    typeof content.generation_payload === "object" &&
    !Array.isArray(content.generation_payload)
      ? (content.generation_payload as Record<string, unknown>)
      : {};

  const payload = {
    ...prev,
    rejected: true,
    rejected_at: new Date().toISOString(),
    rejected_by: auth.user.id,
    rejection_reason: input.reason || "Rejected by operator",
    ai_version: {
      title: content.title,
      hook: content.hook,
      caption: content.caption,
    },
  } as Json;

  const { error } = await auth.supabase
    .from("content")
    .update({
      status: "draft",
      scheduled_at: null,
      generation_payload: payload,
    })
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId);

  if (error) return { error: error.message };

  const admin = createAdminClient();
  await admin
    .from("social_publish_jobs")
    .update({ status: "cancelled", error_message: "Content rejected" })
    .eq("content_id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "pending");

  await logAutomationActivity(admin, {
    organisationId: input.organisationId,
    eventType: "content_rejected",
    message: `Content rejected — AI will avoid repeating this approach.${
      input.reason ? ` (${input.reason})` : ""
    }`,
    severity: "warning",
    metadata: {
      content_id: input.contentId,
      title: content.title,
      hook: content.hook,
      reason: input.reason || null,
    },
  });

  revalidateAutomation();
  return { success: true };
}

export async function skipContent(input: {
  organisationId: string;
  contentId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized" };
  }

  const { data: content } = await auth.supabase
    .from("content")
    .select("id, organisation_id, generation_payload, title")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!content) return { error: "Content not found for this business" };

  const prev =
    content.generation_payload &&
    typeof content.generation_payload === "object" &&
    !Array.isArray(content.generation_payload)
      ? (content.generation_payload as Record<string, unknown>)
      : {};

  const { error } = await auth.supabase
    .from("content")
    .update({
      status: "draft",
      scheduled_at: null,
      generation_payload: {
        ...prev,
        skipped: true,
        skipped_at: new Date().toISOString(),
        skipped_by: auth.user.id,
      } as Json,
    })
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId);

  if (error) return { error: error.message };

  const admin = createAdminClient();
  await admin
    .from("social_publish_jobs")
    .update({ status: "cancelled", error_message: "Skipped by operator" })
    .eq("content_id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "pending");

  await logAutomationActivity(admin, {
    organisationId: input.organisationId,
    eventType: "content_skipped",
    message: `Skipped scheduled item — strategy unchanged (${content.title || "post"}).`,
    severity: "info",
    metadata: { content_id: input.contentId },
  });

  revalidateAutomation();
  return { success: true };
}

export async function markContentHumanEdited(input: {
  organisationId: string;
  contentId: string;
  fields: {
    title?: string | null;
    hook?: string | null;
    caption?: string | null;
    call_to_action?: string | null;
  };
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireMember(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized" };
  }

  const { data: content } = await auth.supabase
    .from("content")
    .select("id, title, hook, caption, call_to_action, generation_payload")
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!content) return { error: "Content not found" };

  const prev =
    content.generation_payload &&
    typeof content.generation_payload === "object" &&
    !Array.isArray(content.generation_payload)
      ? (content.generation_payload as Record<string, unknown>)
      : {};

  const aiVersion =
    (prev.ai_version as Record<string, unknown> | undefined) || {
      title: content.title,
      hook: content.hook,
      caption: content.caption,
      call_to_action: content.call_to_action,
    };

  const { error } = await auth.supabase
    .from("content")
    .update({
      ...input.fields,
      generation_payload: {
        ...prev,
        ai_version: aiVersion,
        human_version: {
          ...input.fields,
          edited_at: new Date().toISOString(),
          edited_by: auth.user.id,
        },
        human_modified: true,
      } as Json,
    })
    .eq("id", input.contentId)
    .eq("organisation_id", input.organisationId);

  if (error) return { error: error.message };

  const admin = createAdminClient();
  await logAutomationActivity(admin, {
    organisationId: input.organisationId,
    eventType: "content_edited",
    message: "You edited AI content — human version saved alongside AI draft.",
    severity: "info",
    metadata: { content_id: input.contentId },
  });

  revalidateAutomation();
  return { success: true };
}

export async function notifyIfNeeded(input: {
  organisationId: string;
  title: string;
  body: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  if (!(await requireManager(auth.supabase, auth.user.id, input.organisationId))) {
    return { error: "Unauthorized" };
  }
  await notifyAutomationIssue(input);
  return { success: true };
}
