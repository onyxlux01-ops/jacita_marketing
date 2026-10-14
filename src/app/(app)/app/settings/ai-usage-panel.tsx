"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateAiLimits } from "@/app/(app)/app/actions/ai-limits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type AiUsageSummary = {
  timezone: string;
  /** Counted against the budget: actual cost where known, else the estimate. */
  monthSpendPence: number;
  /** Up-front estimates for this month's calls. */
  monthEstimatedPence: number;
  /** Costs worked out from the token usage providers reported. */
  monthActualPence: number;
  /** Calls with no reported usage (reserved, timed out, or no usage data). */
  monthCallsWithoutActual: number;
  monthlyBudgetPence: number;
  imagesToday: number;
  dailyImageCap: number;
};

function pounds(pence: number) {
  const p = Math.max(0, pence);
  // Small amounts in pence, so a few text calls do not show as £0.00.
  return p > 0 && p < 100 ? `${p.toFixed(2)}p` : `£${(p / 100).toFixed(2)}`;
}

function Meter({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 100;
  return (
    <div
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <div
        className={pct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function AiUsagePanel({
  organisationId,
  summary,
  canEdit,
}: {
  organisationId: string;
  summary: AiUsageSummary | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [budget, setBudget] = useState(
    summary ? (summary.monthlyBudgetPence / 100).toFixed(2) : "50.00"
  );
  const [cap, setCap] = useState(String(summary?.dailyImageCap ?? 20));

  function save(e: React.FormEvent) {
    e.preventDefault();
    const budgetPence = Math.round(Number(budget) * 100);
    const imageCap = Number(cap);
    if (!Number.isFinite(budgetPence) || budgetPence < 0) {
      toast.error("Enter a monthly budget in pounds, e.g. 50.00");
      return;
    }
    startTransition(async () => {
      const res = await updateAiLimits({
        organisationId,
        monthlyBudgetPence: budgetPence,
        dailyImageCap: imageCap,
      });
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("AI limits updated");
        router.refresh();
      }
    });
  }

  return (
    <section className="jacita-panel space-y-5 rounded-2xl p-5 sm:p-6">
      <div>
        <p className="jacita-label">AI usage</p>
        <h2 className="mt-2 font-heading text-lg font-semibold">AI spending limits</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          AI requests stop for this business when the monthly budget or the daily image
          limit is reached. All amounts come from the app&apos;s price table (to be
          confirmed against the provider&apos;s pricing), not from the provider&apos;s bill.
        </p>
      </div>

      {summary ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 rounded-xl border border-border/70 px-4 py-3">
            <p className="text-xs text-muted-foreground">This month, counted against the budget</p>
            <p className="text-sm font-medium">
              {pounds(summary.monthSpendPence)} of {pounds(summary.monthlyBudgetPence)}
            </p>
            <Meter
              value={summary.monthSpendPence}
              max={summary.monthlyBudgetPence}
              label="AI spend counted this month"
            />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-0.5 pt-1 text-xs text-muted-foreground">
              <dt>Estimated (up front)</dt>
              <dd className="text-right">{pounds(summary.monthEstimatedPence)}</dd>
              <dt>Actual (from usage)</dt>
              <dd className="text-right">{pounds(summary.monthActualPence)}</dd>
              <dt>Calls without usage data</dt>
              <dd className="text-right">{summary.monthCallsWithoutActual}</dd>
            </dl>
          </div>
          <div className="space-y-2 rounded-xl border border-border/70 px-4 py-3">
            <p className="text-xs text-muted-foreground">AI images today</p>
            <p className="text-sm font-medium">
              {summary.imagesToday} of {summary.dailyImageCap}
            </p>
            <Meter
              value={summary.imagesToday}
              max={summary.dailyImageCap}
              label="AI images generated today"
            />
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Months and days follow the business time zone ({summary.timezone}).
          </p>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">AI usage is not available right now.</p>
      )}

      {canEdit ? (
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="ai-budget">Monthly budget (£)</Label>
            <Input
              id="ai-budget"
              inputMode="decimal"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ai-image-cap">AI images per day</Label>
            <Input
              id="ai-image-cap"
              inputMode="numeric"
              value={cap}
              onChange={(e) => setCap(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save limits"}
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted-foreground">
          Only the platform admin can change these limits.
        </p>
      )}
    </section>
  );
}
