"use server";

import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

/** Bounds match the ai_settings check constraints. */
const MAX_BUDGET_PENCE = 1_000_000;
const MAX_IMAGE_CAP = 1_000;

/**
 * Change a business's monthly AI budget and daily AI image cap.
 * Owner / manager (or platform admin) only — also enforced by RLS on
 * ai_settings, so a staff member's direct write is refused too.
 */
export async function updateAiLimits(input: {
  organisationId: string;
  monthlyBudgetPence: number;
  dailyImageCap: number;
}) {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const budget = Number(input.monthlyBudgetPence);
  const cap = Number(input.dailyImageCap);
  if (!Number.isInteger(budget) || budget < 0 || budget > MAX_BUDGET_PENCE) {
    return { error: `Monthly budget must be between £0 and £${MAX_BUDGET_PENCE / 100}.` };
  }
  if (!Number.isInteger(cap) || cap < 0 || cap > MAX_IMAGE_CAP) {
    return { error: `Daily image limit must be a whole number from 0 to ${MAX_IMAGE_CAP}.` };
  }

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("organisation_members")
      .select("role")
      .eq("organisation_id", input.organisationId)
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase.from("users").select("is_platform_admin").eq("id", user.id).maybeSingle(),
  ]);
  const canManage =
    (membership && ["owner", "manager"].includes(membership.role)) ||
    Boolean(profile?.is_platform_admin);
  if (!canManage) {
    return { error: "Only the owner or a manager can change AI limits." };
  }

  const { data: previous } = await supabase
    .from("ai_settings")
    .select("monthly_budget_pence, daily_image_cap")
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  const { error } = await supabase.from("ai_settings").upsert(
    {
      organisation_id: input.organisationId,
      monthly_budget_pence: budget,
      daily_image_cap: cap,
      updated_by: user.id,
    },
    { onConflict: "organisation_id" }
  );
  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: user.id,
    action: "ai.limits_updated",
    entity_type: "ai_settings",
    entity_id: input.organisationId,
    metadata: {
      monthly_budget_pence: budget,
      daily_image_cap: cap,
      previous_monthly_budget_pence: previous?.monthly_budget_pence ?? 5000,
      previous_daily_image_cap: previous?.daily_image_cap ?? 20,
    },
  });

  revalidatePath("/app/settings");
  return { success: true as const };
}
