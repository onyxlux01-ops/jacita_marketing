/**
 * AI spending limits (audit finding 10). See the migration
 * 20261014210000_ai_spend_limits.sql for the ledger and the README for the
 * go-live checks.
 */
export { guardedGenerateText, guardedGenerateImage } from "@/lib/ai/spend/guard";
export { runWithAiSpend, bindAiSpend, currentAiSpend } from "@/lib/ai/spend/context";
export { AiSpendError, isAiSpendError, formatPence } from "@/lib/ai/spend/errors";
export type { AiSpendErrorCode } from "@/lib/ai/spend/errors";
export { withAiRoute, aiSpendErrorResponse, AI_INPUT_LIMITS } from "@/lib/ai/spend/route";
export { getAiSpendTotals, MAX_INFLIGHT_PER_USER } from "@/lib/ai/spend/ledger";
export { checkAiHeadroom } from "@/lib/ai/spend/headroom";
export type { AiSpendTotals } from "@/lib/ai/spend/ledger";
