"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  applyCampaignPlan,
  applyWeeklyPlan,
} from "@/app/(app)/app/actions/ai";
import { Button } from "@/components/ui/button";
import type { MarketingGoalKey } from "@/lib/ai/goals";
import type { AssistantIntent } from "@/lib/ai/schemas";
import type { CampaignPlan, StrategyResult, WeeklyPlan } from "@/lib/ai/schemas";
import { cn } from "@/lib/utils";

const QUICK_ACTIONS = [
  {
    label: "Create this week's content",
    preset: "week",
  },
  {
    label: "Promote a service",
    preset: "promote",
  },
  {
    label: "Grow my social following",
    preset: "growth",
  },
  {
    label: "Get more bookings",
    preset: "bookings",
  },
  {
    label: "Create a campaign",
    preset: "campaign",
  },
  {
    label: "Analyse my marketing",
    preset: "analyse",
  },
] as const;

type AssistantResult = AssistantIntent & {
  businessName?: string;
};

export function AiMarketingWorkspace({
  businessName,
  organisationId,
}: {
  businessName: string;
  organisationId: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AssistantResult | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  function runAssistant(requestText: string, preset?: string) {
    if (!organisationId) {
      toast.error("Select or create a business first");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: organisationId,
            request_text: requestText,
            preset_intent: preset || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Assistant failed");
          return;
        }
        setResult({
          ...(data.result as AssistantIntent),
          businessName: data.business?.name,
        });
      } catch {
        toast.error("Could not reach the marketing assistant");
      }
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const notes = value.trim();
    if (!notes) {
      toast.error("Tell Jacita what you want to achieve");
      return;
    }
    runAssistant(notes);
  }

  async function createWeeklyPlan() {
    if (!organisationId || !result) return;
    setBusyAction("week");
    try {
      const res = await fetch("/api/ai/weekly-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisation_id: organisationId,
          request_text: value || result.summary,
          goal_key: result.goal_key,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Weekly plan failed");
        return;
      }
      const applied = await applyWeeklyPlan({
        organisationId,
        goalKey: data.goal_key as MarketingGoalKey,
        plan: data.plan as WeeklyPlan,
        strategy: (data.strategy as StrategyResult) || null,
      });
      if ("error" in applied && applied.error) {
        toast.error(applied.error);
        return;
      }
      const count = "ids" in applied && applied.ids ? applied.ids.length : 0;
      toast.success(`Created ${count} draft posts for the week`);
      router.push("/app/content");
      router.refresh();
    } catch {
      toast.error("Could not create weekly plan");
    } finally {
      setBusyAction(null);
    }
  }

  async function createCampaign() {
    if (!organisationId || !result) return;
    setBusyAction("campaign");
    try {
      const res = await fetch("/api/ai/campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisation_id: organisationId,
          request_text: value || result.summary,
          goal_key: result.goal_key,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Campaign generation failed");
        return;
      }
      const applied = await applyCampaignPlan({
        organisationId,
        goalKey: data.goal_key as MarketingGoalKey,
        campaign: data.campaign as CampaignPlan,
        strategy: (data.strategy as StrategyResult) || null,
      });
      if ("error" in applied && applied.error) {
        toast.error(applied.error);
        return;
      }
      toast.success("Draft campaign created — review before approving");
      router.push("/app/campaigns");
      router.refresh();
    } catch {
      toast.error("Could not create campaign");
    } finally {
      setBusyAction(null);
    }
  }

  async function analysePerformance() {
    if (!organisationId) return;
    setBusyAction("analyse");
    try {
      const res = await fetch("/api/ai/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organisation_id: organisationId,
          request_text: value || "Analyse my performance",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Analysis failed");
        return;
      }
      setResult({
        intent: "analyse_performance",
        goal_key: "increase_engagement",
        summary: data.result?.summary || "Performance analysis",
        recommendation:
          data.result?.insights?.[0]?.text ||
          data.result?.summary ||
          "No insights available yet.",
        suggested_service_name: null,
        suggested_action_label: "View analytics",
        missing_information: [],
        businessName,
      });
      router.refresh();
    } catch {
      toast.error("Could not analyse performance");
    } finally {
      setBusyAction(null);
    }
  }

  function openStudio() {
    const notes = value.trim() || result?.recommendation || "";
    router.push(
      notes
        ? `/app/content/new?notes=${encodeURIComponent(notes)}&goal=${encodeURIComponent(result?.goal_key || "")}`
        : "/app/content/new"
    );
  }

  function runPrimaryAction() {
    if (!result) return;
    if (result.intent === "weekly_plan") return void createWeeklyPlan();
    if (
      result.intent === "create_campaign" ||
      result.intent === "get_bookings"
    ) {
      return void createCampaign();
    }
    if (result.intent === "analyse_performance") {
      return void analysePerformance();
    }
    openStudio();
  }

  return (
    <section className="jacita-enter jacita-enter-delay-1 border-y border-border/70 py-8 sm:py-10">
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-primary" aria-hidden />
        <p className="text-sm font-medium text-primary">Marketing assistant</p>
      </div>
      <h2 className="mt-3 font-heading text-[1.65rem] font-semibold tracking-tight sm:text-[1.85rem]">
        What are we working on?
      </h2>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
        Tell your marketing assistant what you want to achieve for{" "}
        {businessName || "this business"}.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <label htmlFor="ai-goal" className="sr-only">
          Marketing goal
        </label>
        <textarea
          id="ai-goal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={3}
          placeholder='e.g. "I want more bookings this week."'
          className={cn(
            "w-full resize-none rounded-xl border border-border/80 bg-card px-4 py-3.5 text-[15px] leading-relaxed",
            "placeholder:text-muted-foreground/70",
            "shadow-[0_1px_2px_rgba(15,18,24,0.03)]",
            "outline-none transition-[border-color,box-shadow] duration-200",
            "focus-visible:border-primary/40 focus-visible:ring-2 focus-visible:ring-primary/20"
          )}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={pending || !organisationId}
            className="rounded-lg px-5"
            size="lg"
          >
            {pending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                Start
                <ArrowRight className="size-4" />
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground">
            Jacita recommends a marketing outcome for this business
          </p>
        </div>
      </form>

      {result ? (
        <div className="mt-6 space-y-4 rounded-xl border border-border/70 bg-card/60 p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Recommendation
          </p>
          <p className="font-heading text-lg font-semibold tracking-tight">
            {result.summary}
          </p>
          <p className="text-[15px] leading-relaxed text-foreground/90">
            {result.recommendation}
          </p>
          {result.missing_information?.length ? (
            <p className="text-xs text-muted-foreground">
              Missing for stronger results:{" "}
              {result.missing_information.join(", ")}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="button"
              className="rounded-lg"
              disabled={Boolean(busyAction) || pending}
              onClick={runPrimaryAction}
            >
              {busyAction ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              {result.suggested_action_label || "Continue"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              disabled={Boolean(busyAction)}
              onClick={openStudio}
            >
              Open Content Studio
            </Button>
            {(result.intent === "create_campaign" ||
              result.intent === "get_bookings" ||
              result.intent === "promote_service") && (
              <Button
                type="button"
                variant="ghost"
                className="rounded-lg"
                disabled={Boolean(busyAction)}
                onClick={() => void createWeeklyPlan()}
              >
                Weekly plan instead
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <div className="mt-7">
        <p className="text-xs font-medium text-muted-foreground">Quick actions</p>
        <ul className="mt-3 flex flex-wrap gap-x-1 gap-y-1">
          {QUICK_ACTIONS.map((action) => (
            <li key={action.label}>
              <button
                type="button"
                onClick={() => {
                  setValue(action.label);
                  runAssistant(action.label, action.preset);
                }}
                disabled={pending || !organisationId}
                className="group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
              >
                {action.label}
                <ArrowRight className="size-3 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-60" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
