import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { AiSpendError, refusalMessage } from "@/lib/ai/spend/errors";
import type { AiSpendContext } from "@/lib/ai/spend/context";

/** At most this many paid AI calls in flight per user (ledger-enforced). */
export const MAX_INFLIGHT_PER_USER = 2;

export type AiSpendTotals = {
  timezone: string;
  month_start: string;
  day_start: string;
  month_spend_pence: number;
  month_estimated_pence: number;
  month_actual_pence: number;
  month_calls_without_actual: number;
  monthly_budget_pence: number;
  images_today: number;
  daily_image_cap: number;
};

/**
 * Hold an upper-bound reservation. Throws AiSpendError when the business is
 * over budget / over its image cap, the user has too many calls in flight,
 * or the ledger cannot be reached (fail closed: no ledger, no paid call).
 */
export async function reserveAiSpend(
  ctx: AiSpendContext,
  input: {
    provider: string;
    model: string;
    estimatedPence: number;
    imageCount: number;
    attempt: number;
  }
): Promise<string> {
  if (!ctx.organisationId) {
    throw new AiSpendError(
      "AI_SPEND_CONTEXT_MISSING",
      "AI call refused: no business is attached to this request."
    );
  }
  let data: unknown;
  try {
    const admin = createAdminClient();
    const res = await admin.rpc("reserve_ai_spend", {
      p_organisation_id: ctx.organisationId,
      p_user_id: ctx.userId as string,
      p_task: ctx.task,
      p_provider: input.provider,
      p_model: input.model,
      p_estimated_pence: input.estimatedPence,
      p_image_count: input.imageCount,
      p_request_id: ctx.requestId,
      p_attempt: input.attempt,
      p_max_inflight_per_user: MAX_INFLIGHT_PER_USER,
    });
    if (res.error) throw new Error(res.error.message);
    data = res.data;
  } catch (e) {
    console.error("[ai-spend] reserve failed", e instanceof Error ? e.message : e);
    throw new AiSpendError(
      "AI_SPEND_UNAVAILABLE",
      "AI usage could not be checked, so AI generation is paused. Try again shortly."
    );
  }

  const result = (data ?? {}) as Record<string, unknown>;
  if (result.ok === true && typeof result.id === "string") return result.id;

  const { code, message } = refusalMessage(String(result.code ?? ""), result);
  throw new AiSpendError(code, message, {
    month_spend_pence: result.month_spend_pence ?? null,
    monthly_budget_pence: result.monthly_budget_pence ?? null,
    images_today: result.images_today ?? null,
    daily_image_cap: result.daily_image_cap ?? null,
  });
}

/** Settle as charged. Never throws: a ledger hiccup must not lose the result. */
export async function commitAiSpend(
  usageId: string,
  input: {
    actualPence: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    errorCode?: string | null;
  }
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await createAdminClient().rpc("commit_ai_spend", {
        p_usage_id: usageId,
        p_actual_pence: input.actualPence as number,
        p_input_tokens: input.inputTokens as number,
        p_output_tokens: input.outputTokens as number,
        p_error_code: (input.errorCode ?? null) as string,
      });
      if (!error) return;
      console.error("[ai-spend] commit failed", error.message);
    } catch (e) {
      console.error("[ai-spend] commit failed", e instanceof Error ? e.message : e);
    }
  }
}

/** Settle as not charged. Never throws (a stale reservation expires anyway). */
export async function releaseAiSpend(usageId: string, errorCode: string) {
  try {
    const { error } = await createAdminClient().rpc("release_ai_spend", {
      p_usage_id: usageId,
      p_error_code: errorCode,
    });
    if (error) console.error("[ai-spend] release failed", error.message);
  } catch (e) {
    console.error("[ai-spend] release failed", e instanceof Error ? e.message : e);
  }
}

/** Current totals for a business (service role). Null if it does not exist. */
export async function getAiSpendTotals(organisationId: string): Promise<AiSpendTotals | null> {
  const { data, error } = await createAdminClient().rpc("ai_spend_totals", {
    p_organisation_id: organisationId,
  });
  if (error) throw new Error(`Could not read AI spend: ${error.message}`);
  return (data as AiSpendTotals | null) ?? null;
}
