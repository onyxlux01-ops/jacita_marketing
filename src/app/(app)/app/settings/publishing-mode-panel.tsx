"use client";

import { useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { updateAutopilotMode } from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type Mode = "manual" | "approval_required" | "autopilot";

export function PublishingModePanel({
  organisationId,
  mode,
}: {
  organisationId: string;
  mode: Mode;
}) {
  const [pending, startTransition] = useTransition();

  function setMode(next: Mode) {
    startTransition(async () => {
      const res = await updateAutopilotMode({
        organisationId,
        mode: next,
      });
      if (res.error) toast.error(res.error);
      else toast.success("Publishing mode updated");
    });
  }

  const options: Array<{ id: Mode; title: string; desc: string }> = [
    {
      id: "manual",
      title: "Manual",
      desc: "AI can draft recommendations. Nothing schedules or publishes automatically.",
    },
    {
      id: "approval_required",
      title: "Approval",
      desc: "AI creates and proposes posts. You approve before publish.",
    },
    {
      id: "autopilot",
      title: "Autopilot",
      desc: "AI creates, schedules, and publishes within your guardrails.",
    },
  ];

  return (
    <section className="jacita-panel rounded-2xl p-5 sm:p-6">
      <p className="jacita-label">Publishing</p>
      <h2 className="mt-2 font-heading text-lg font-semibold">
        Publishing mode
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Controls how AI-generated content reaches your connected accounts.
        Full frequency, platforms, and pause controls live on{" "}
        <Link href="/app/automation" className="text-primary hover:underline">
          Automation
        </Link>
        .
      </p>
      <div className="mt-5 space-y-3">
        {options.map((opt) => (
          <div
            key={opt.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-4 py-3"
          >
            <div>
              <Label className="text-sm font-medium">{opt.title}</Label>
              <p className="mt-0.5 text-xs text-muted-foreground">{opt.desc}</p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={mode === opt.id ? "default" : "outline"}
              disabled={pending}
              onClick={() => setMode(opt.id)}
            >
              {mode === opt.id ? "Active" : "Use"}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
