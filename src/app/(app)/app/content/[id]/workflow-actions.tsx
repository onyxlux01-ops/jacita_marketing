"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateContentStatus } from "@/app/(app)/app/actions/org";
import { scheduleContentPublishing } from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONTENT_STATUS_FLOW, type ContentStatus } from "@/lib/types";

const NEXT: Partial<Record<ContentStatus, ContentStatus>> = {
  draft: "review",
  review: "approved",
  approved: "scheduled",
};

const LABELS: Partial<Record<ContentStatus, string>> = {
  review: "Send to review",
  approved: "Approve",
  scheduled: "Schedule & queue",
};

export function ContentWorkflow({
  contentId,
  organisationId,
  status,
  scheduledAt,
}: {
  contentId: string;
  organisationId: string;
  status: ContentStatus;
  scheduledAt?: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const next = NEXT[status];
  const defaultWhen = scheduledAt
    ? new Date(scheduledAt).toISOString().slice(0, 16)
    : new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16);
  const [when, setWhen] = useState(defaultWhen);

  function advance(to: ContentStatus) {
    startTransition(async () => {
      if (to === "scheduled") {
        const iso = new Date(when).toISOString();
        const res = await scheduleContentPublishing({
          contentId,
          organisationId,
          scheduledAt: iso,
        });
        if (res.error) toast.error(res.error);
        else toast.success("Scheduled for publishing");
        return;
      }
      const res = await updateContentStatus(contentId, to);
      if (res.error) toast.error(res.error);
      else toast.success(`Status updated to ${to}`);
    });
  }

  return (
    <div className="space-y-4">
      <ol className="flex flex-wrap gap-2">
        {CONTENT_STATUS_FLOW.map((step) => {
          const idx = CONTENT_STATUS_FLOW.indexOf(step);
          const currentIdx = CONTENT_STATUS_FLOW.indexOf(
            status === "failed" ? "scheduled" : status
          );
          const done = status === "failed" ? false : currentIdx >= idx;
          return (
            <li
              key={step}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium capitalize ${
                done
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {step}
            </li>
          );
        })}
      </ol>

      {(status === "approved" || status === "scheduled" || status === "failed") && (
        <div className="space-y-2">
          <Label htmlFor="schedule_at">Publish at</Label>
          <Input
            id="schedule_at"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="max-w-xs"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {next ? (
          <Button disabled={pending} onClick={() => advance(next)}>
            {LABELS[next] ?? `Move to ${next}`}
          </Button>
        ) : null}
        {status === "scheduled" || status === "failed" ? (
          <Button
            disabled={pending}
            variant="outline"
            onClick={() => advance("scheduled")}
          >
            {status === "failed" ? "Retry schedule" : "Update schedule"}
          </Button>
        ) : null}
        {status !== "draft" && status !== "publishing" ? (
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => advance("draft")}
          >
            Revert to draft
          </Button>
        ) : null}
      </div>
    </div>
  );
}
