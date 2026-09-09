"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  saveAutomationSettings,
  startAutomation,
} from "@/app/(app)/app/actions/automation";
import {
  AUTOMATION_GOAL_OPTIONS,
  CONTENT_PREFERENCE_OPTIONS,
  type AutomationMode,
} from "@/lib/automation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STEPS = [
  "Business",
  "Goals",
  "Services",
  "Media",
  "Social",
  "Mode",
  "Frequency",
  "Start",
] as const;

export function AutomationSetupWizard({
  organisationId,
  businessName,
  readiness,
}: {
  organisationId: string;
  businessName: string;
  readiness: {
    ready: boolean;
    checks: Array<{ id: string; label: string; ok: boolean }>;
  };
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<AutomationMode>("approval");
  const [goals, setGoals] = useState<string[]>(["increase_brand_awareness"]);
  const [prefs, setPrefs] = useState<string[]>([
    "promotional",
    "educational",
    "services",
    "community",
  ]);
  const [posts, setPosts] = useState(5);
  const [reels, setReels] = useState(2);
  const [platforms, setPlatforms] = useState([
    "instagram",
    "facebook",
    "tiktok",
  ]);

  function toggle(list: string[], id: string) {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  }

  function finish() {
    startTransition(async () => {
      const saved = await saveAutomationSettings({
        organisationId,
        mode,
        postsPerWeek: posts,
        reelsPerWeek: reels,
        platforms,
        contentPreferences: prefs,
        primaryGoals: goals,
        markSetupComplete: true,
      });
      if ("error" in saved && saved.error) {
        toast.error(saved.error);
        return;
      }
      const started = await startAutomation({ organisationId, mode });
      if ("error" in started && started.error) {
        toast.error(started.error);
        return;
      }
      toast.success("AI marketing automation is active");
      router.push("/app/automation");
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium",
              i === step
                ? "bg-primary text-primary-foreground"
                : i < step
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      {step === 0 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">
            Confirm business
          </h2>
          <p className="text-sm text-muted-foreground">
            Automation will run only for <strong>{businessName}</strong>. Switch
            businesses from the sidebar before continuing if needed.
          </p>
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">
            Marketing goals
          </h2>
          <div className="flex flex-wrap gap-2">
            {AUTOMATION_GOAL_OPTIONS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGoals(toggle(goals, g.id))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  goals.includes(g.id)
                    ? "border-primary bg-primary/10"
                    : "border-border"
                )}
              >
                {g.label}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 2 || step === 3 || step === 4 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">
            {STEPS[step]}
          </h2>
          <ul className="space-y-2 text-sm">
            {readiness.checks
              .filter((c) =>
                step === 2
                  ? c.id === "services"
                  : step === 3
                    ? c.id === "media"
                    : c.id === "social"
              )
              .map((c) => (
                <li key={c.id} className="flex justify-between">
                  <span>{c.label}</span>
                  <span className={c.ok ? "text-primary" : "text-amber-700"}>
                    {c.ok ? "Ready" : "Add in workspace"}
                  </span>
                </li>
              ))}
          </ul>
          <div className="flex gap-3 text-sm">
            {step === 2 ? (
              <Link href="/app/services" className="text-primary hover:underline">
                Manage services
              </Link>
            ) : null}
            {step === 3 ? (
              <Link href="/app/media" className="text-primary hover:underline">
                Upload media
              </Link>
            ) : null}
            {step === 4 ? (
              <Link href="/app/social" className="text-primary hover:underline">
                Connect accounts
              </Link>
            ) : null}
          </div>
        </section>
      ) : null}

      {step === 5 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">
            Automation mode
          </h2>
          {(
            [
              ["approval", "Approval — AI proposes, you approve"],
              ["autopilot", "Autopilot — AI publishes within guardrails"],
              ["manual", "Manual — recommendations only"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setMode(id)}
              className={cn(
                "block w-full rounded-xl border px-4 py-3 text-left text-sm",
                mode === id ? "border-primary bg-primary/5" : "border-border"
              )}
            >
              {label}
            </button>
          ))}
        </section>
      ) : null}

      {step === 6 ? (
        <section className="space-y-4">
          <h2 className="font-heading text-xl font-semibold">
            Posting preferences
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              Posts / week
              <input
                type="number"
                min={1}
                max={21}
                value={posts}
                onChange={(e) => setPosts(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
            <label className="text-sm">
              Reels / week
              <input
                type="number"
                min={0}
                max={14}
                value={reels}
                onChange={(e) => setReels(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            {CONTENT_PREFERENCE_OPTIONS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPrefs(toggle(prefs, p.id))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs",
                  prefs.includes(p.id)
                    ? "border-primary bg-primary/10"
                    : "border-border"
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {(["instagram", "facebook", "tiktok"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setPlatforms(toggle(platforms, p))}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs capitalize",
                  platforms.includes(p)
                    ? "border-primary bg-primary/10"
                    : "border-border"
                )}
              >
                {p}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {step === 7 ? (
        <section className="space-y-3">
          <h2 className="font-heading text-xl font-semibold">
            Start automation
          </h2>
          <p className="text-sm text-muted-foreground">
            Mode: <strong className="capitalize">{mode}</strong> · {posts} posts /
            week · {platforms.join(", ")}
          </p>
          {!readiness.ready && mode !== "manual" ? (
            <p className="text-sm text-amber-700">
              Complete required setup checks before Approval or Autopilot.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              When you start, AI will build context, strategy, content plan, and
              begin the loop for {businessName}.
            </p>
          )}
        </section>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={step === 0 || pending}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            disabled={pending}
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
          >
            Continue
          </Button>
        ) : (
          <Button type="button" disabled={pending} onClick={finish}>
            Start automation
          </Button>
        )}
      </div>
    </div>
  );
}
