import "server-only";

import { AiSpendError, formatPence } from "@/lib/ai/spend/errors";
import { getAiSpendTotals } from "@/lib/ai/spend/ledger";
import { estimateTextPence, getModelPrice, type TextModelPrice } from "@/lib/ai/spend/prices";

/**
 * Pre-flight check for work that will make several AI calls (the automation
 * engine). Returns the refusal to record when the business cannot afford even
 * one more text call this month, or when the ledger cannot be read; null when
 * it may go ahead. Each call is still reserved individually, so this is a
 * shortcut, not the enforcement.
 */
export async function checkAiHeadroom(
  organisationId: string,
  textModelId = "gpt-5-mini"
): Promise<AiSpendError | null> {
  let totals;
  try {
    totals = await getAiSpendTotals(organisationId);
  } catch {
    return new AiSpendError(
      "AI_SPEND_UNAVAILABLE",
      "AI usage could not be checked, so this automation run was skipped."
    );
  }
  if (!totals) return null;

  const price = getModelPrice(textModelId);
  const oneCall =
    price && price.kind === "text"
      ? estimateTextPence(price as TextModelPrice, 0, (price as TextModelPrice).maxOutputTokens)
      : 0;
  const spend = Number(totals.month_spend_pence);
  const budget = Number(totals.monthly_budget_pence);
  // Same comparison as the database (exact numeric), minus float noise.
  if (spend + oneCall > budget + 1e-6) {
    return new AiSpendError(
      "AI_BUDGET_EXCEEDED",
      `This business has reached its AI budget for this month (estimated ${formatPence(spend)} used of ${formatPence(budget)}), so automation was skipped.`,
      { month_spend_pence: spend, monthly_budget_pence: budget }
    );
  }
  return null;
}
