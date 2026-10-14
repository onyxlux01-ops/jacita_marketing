"use server";

import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { retryPublishJob } from "@/lib/social/scheduler";

async function getAuthed() {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" as const };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

export async function retryFailedPublishJob(input: {
  organisationId: string;
  jobId: string;
  /** Required for an `uncertain` job: the user checked the platform and the post is not live. */
  confirmNotLive?: boolean;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", input.organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();

  if (!membership || !["owner", "manager"].includes(membership.role)) {
    return { error: "Unauthorized" };
  }

  // Ownership enforced again inside retry via organisation_id filter
  const result = await retryPublishJob({
    jobId: input.jobId,
    organisationId: input.organisationId,
    userId: auth.user.id,
    force: true,
    confirmNotLive: input.confirmNotLive === true,
  });

  revalidatePath("/app/automation");
  revalidatePath("/app/social");
  revalidatePath("/app");

  if (result && "error" in result && result.error) {
    return {
      error: String(result.error),
      needsConfirmation: "needsConfirmation" in result && result.needsConfirmation === true,
    };
  }
  return { success: true, result };
}
