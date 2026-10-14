/** Typed refusals from the AI spend guard. */

export type AiSpendErrorCode =
  | "AI_BUDGET_EXCEEDED"
  | "AI_DAILY_IMAGE_CAP"
  | "AI_CONCURRENCY_LIMIT"
  | "AI_INPUT_TOO_LARGE"
  | "AI_MODEL_NOT_PRICED"
  | "AI_SPEND_UNAVAILABLE"
  | "AI_SPEND_CONTEXT_MISSING"
  | "AI_NOT_MEMBER";

const STATUS: Record<AiSpendErrorCode, number> = {
  AI_BUDGET_EXCEEDED: 429,
  AI_DAILY_IMAGE_CAP: 429,
  AI_CONCURRENCY_LIMIT: 429,
  AI_INPUT_TOO_LARGE: 413,
  AI_MODEL_NOT_PRICED: 503,
  AI_SPEND_UNAVAILABLE: 503,
  AI_SPEND_CONTEXT_MISSING: 500,
  AI_NOT_MEMBER: 403,
};

export class AiSpendError extends Error {
  readonly code: AiSpendErrorCode;
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(code: AiSpendErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = "AiSpendError";
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  toJSON() {
    return { error: this.message, code: this.code, ...this.details };
  }
}

export function isAiSpendError(error: unknown): error is AiSpendError {
  // Duck-typed as well, in case the module is loaded twice (ESM + CJS).
  return (
    error instanceof AiSpendError ||
    (error instanceof Error &&
      error.name === "AiSpendError" &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { status?: unknown }).status === "number")
  );
}

export function formatPence(pence: number) {
  return `£${(Math.max(0, pence) / 100).toFixed(2)}`;
}

/** User-facing message for a reservation the database refused. */
export function refusalMessage(
  code: string,
  totals: Record<string, unknown>
): { code: AiSpendErrorCode; message: string } {
  const spend = Number(totals.month_spend_pence ?? 0);
  const budget = Number(totals.monthly_budget_pence ?? 0);
  const images = Number(totals.images_today ?? 0);
  const cap = Number(totals.daily_image_cap ?? 0);
  switch (code) {
    case "AI_BUDGET_EXCEEDED":
      return {
        code,
        message: `This business has reached its AI budget for this month (estimated ${formatPence(spend)} used of ${formatPence(budget)}). Only the platform admin can change the budget.`,
      };
    case "AI_DAILY_IMAGE_CAP":
      return {
        code,
        message: `This business has used ${images} of its ${cap} AI images for today. The limit resets at midnight business time; only the platform admin can change it.`,
      };
    case "AI_CONCURRENCY_LIMIT":
      return {
        code,
        message:
          "You already have AI requests in progress. Wait for them to finish, then try again.",
      };
    case "AI_NOT_MEMBER":
      return { code, message: "You are not a member of this business." };
    default:
      return {
        code: "AI_SPEND_UNAVAILABLE",
        message: "AI usage could not be checked, so AI generation is paused. Try again shortly.",
      };
  }
}
