"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { saveAdvertisingLimits } from "@/app/(app)/app/actions/meta-ads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Scope = "per_campaign" | "business_total";
type Period = "daily" | "lifetime";

const selectClass =
  "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Spend limits for this business (owner / manager; the server refuses
 * anyone else). Limits are checked again when each action is executed, so
 * lowering a limit also stops actions that were proposed earlier.
 */
export function AdLimitsForm({
  organisationId,
  currency,
  limitCents,
  maxActiveCampaigns,
  limitScope,
  limitPeriod,
}: {
  organisationId: string;
  currency: string | null;
  limitCents: number;
  maxActiveCampaigns: number;
  limitScope: Scope;
  limitPeriod: Period;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [amount, setAmount] = useState(limitCents ? String(limitCents / 100) : "");
  const [maxActive, setMaxActive] = useState(String(maxActiveCampaigns));
  const [scope, setScope] = useState<Scope>(limitScope);
  const [period, setPeriod] = useState<Period>(limitPeriod);

  function save() {
    const major = amount.trim() === "" ? 0 : Number(amount);
    const max = Number(maxActive);
    if (!Number.isFinite(major) || major < 0) {
      toast.error("Enter a spend limit of 0 or more");
      return;
    }
    if (!Number.isInteger(max) || max < 0 || max > 100) {
      toast.error("Enter a whole number of active campaigns (0-100)");
      return;
    }
    startTransition(async () => {
      const res = await saveAdvertisingLimits({
        organisationId,
        dailySpendLimitCents: Math.round(major * 100),
        maxActiveCampaigns: max,
        limitScope: scope,
        limitPeriod: period,
      });
      if ("error" in res && res.error) toast.error(res.error);
      else {
        toast.success("Spend limits saved");
        router.refresh();
      }
    });
  }

  const unit = currency ? ` (${currency})` : "";
  return (
    <div className="mt-5 space-y-3 rounded-xl border border-border/60 px-4 py-4">
      <div>
        <p className="text-sm font-medium">Spend limits</p>
        <p className="text-xs text-muted-foreground">
          Owners and managers can change these. Every approval is checked
          against the limits in force when it runs. A limit of 0 blocks
          creating, enabling or changing campaigns.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ad-limit">Spend limit{unit}</Label>
          <Input
            id="ad-limit"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ad-max-active">Max active campaigns</Label>
          <Input
            id="ad-max-active"
            inputMode="numeric"
            value={maxActive}
            onChange={(e) => setMaxActive(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ad-scope">Limit applies to</Label>
          <select
            id="ad-scope"
            className={selectClass}
            value={scope}
            onChange={(e) => setScope(e.target.value as Scope)}
          >
            <option value="per_campaign">Each campaign</option>
            <option value="business_total">All active campaigns together</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ad-period">Budget period</Label>
          <select
            id="ad-period"
            className={selectClass}
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
          >
            <option value="daily">Daily budgets</option>
            <option value="lifetime">Lifetime budgets</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {scope === "per_campaign"
          ? `No single campaign's ${period} budget may exceed the limit.`
          : `The ${period} budgets of all active campaigns together may not exceed the limit.`}{" "}
        Campaigns must use {period} budgets.
      </p>
      <Button type="button" size="sm" disabled={pending} onClick={save}>
        Save limits
      </Button>
    </div>
  );
}
