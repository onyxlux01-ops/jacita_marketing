"use server";

import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";

/** Bounds match set_ai_limits() and the ai_settings check constraints. */
const MAX_BUDGET_PENCE = 1_000_000;
const MAX_IMAGE_CAP = 1_000;

/**
 * Change a business's monthly AI budget and daily AI image cap.
 * Platform admin only: every business shares the operator's provider key.
 * Enforced by set_ai_limits() in the database (owners and managers see the
 * limits read-only); the check here only gives a clearer message.
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

  const { data: profile } = await supabase
    .from("users")
    .select("is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.is_platform_admin) {
    return { error: "Only the platform admin can change AI limits." };
  }

  const { error } = await supabase.rpc("set_ai_limits", {
    p_organisation_id: input.organisationId,
    p_monthly_budget_pence: budget,
    p_daily_image_cap: cap,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/settings");
  return { success: true as const };
}
