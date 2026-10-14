import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import type { AiSpendError } from "@/lib/ai/spend/errors";

/**
 * Who pays for the AI calls made while handling one request (API route,
 * automation run, page render). Every paid call reads this; a paid call with
 * no context, or with no business bound, is refused.
 */
export type AiSpendContext = {
  task: string;
  organisationId: string | null;
  userId: string | null;
  requestId: string;
  /** Set when the guard refused a call, even if the caller swallowed it. */
  refusal: AiSpendError | null;
};

const g = globalThis as unknown as { __jacitaAiSpendStore?: AsyncLocalStorage<AiSpendContext> };
// One store per process even if this module is loaded twice (ESM + CJS).
const store: AsyncLocalStorage<AiSpendContext> =
  g.__jacitaAiSpendStore ?? (g.__jacitaAiSpendStore = new AsyncLocalStorage<AiSpendContext>());

export function runWithAiSpend<T>(
  input: { task: string; organisationId?: string | null; userId?: string | null },
  fn: () => Promise<T>
): Promise<T> {
  const ctx: AiSpendContext = {
    task: input.task,
    organisationId: input.organisationId ?? null,
    userId: input.userId ?? null,
    requestId: randomUUID(),
    refusal: null,
  };
  return store.run(ctx, fn);
}

export function currentAiSpend(): AiSpendContext | null {
  return store.getStore() ?? null;
}

/**
 * Bind the business and user once access has been checked. Called by
 * requireOrgAccess(); a request cannot switch to another business afterwards.
 */
export function bindAiSpend(organisationId: string, userId: string | null) {
  const ctx = store.getStore();
  if (!ctx) return;
  if (ctx.organisationId && ctx.organisationId !== organisationId) {
    throw new Error("AI spend context is already bound to another business");
  }
  ctx.organisationId = organisationId;
  ctx.userId = userId;
}
