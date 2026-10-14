"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateContentStatus } from "@/app/(app)/app/actions/org";
import { scheduleContentPublishing } from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  formatInTimeZone,
  fromZonedInputValue,
  normaliseTimeZone,
  timeZoneLabel,
  toZonedInputValue,
} from "@/lib/timezone";
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

/** Next whole hour + 1, so server and client render the same default. */
function defaultScheduleIso() {
  const d = new Date();
  d.setUTCMinutes(0, 0, 0);
  return new Date(d.getTime() + 2 * 60 * 60 * 1000).toISOString();
}

export function ContentWorkflow({
  contentId,
  organisationId,
  status,
  scheduledAt,
  timeZone,
}: {
  contentId: string;
  organisationId: string;
  status: ContentStatus;
  scheduledAt?: string | null;
  /** The business's IANA zone (organisations.timezone). */
  timeZone: string;
}) {
  const [pending, startTransition] = useTransition();
  const next = NEXT[status];
  const tz = normaliseTimeZone(timeZone);
  // The field holds the BUSINESS's wall-clock time, not the browser's.
  const [when, setWhen] = useState(() =>
    toZonedInputValue(scheduledAt || defaultScheduleIso(), tz)
  );
  const parsed = fromZonedInputValue(when, tz);

  function advance(to: ContentStatus) {
    startTransition(async () => {
      if (to === "scheduled") {
        // Convert once, here, from the business zone to UTC.
        if (!parsed.ok) {
          toast.error(parsed.message);
          return;
        }
        const res = await scheduleContentPublishing({
          contentId,
          organisationId,
          scheduledAt: parsed.iso,
        });
        if (res.error) {
          toast.error(res.error);
          return;
        }
        const queued = (res.platforms ?? [])
          .filter((p) => p.status === "queued")
          .map((p) => p.platform);
        toast.success(
          `Scheduled for ${formatInTimeZone(parsed.iso, tz)}${
            queued.length ? ` on ${queued.join(", ")}` : ""
          }`
        );
        if (res.warning) toast.warning(res.warning);
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
          <Label htmlFor="schedule_at">
            Publish at ({timeZoneLabel(tz, parsed.ok ? parsed.iso : undefined)})
          </Label>
          <Input
            id="schedule_at"
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
            className="max-w-xs"
            aria-describedby="schedule_at_hint"
          />
          <p id="schedule_at_hint" className="text-xs text-muted-foreground">
            {!parsed.ok
              ? parsed.message
              : parsed.ambiguous
                ? `${formatInTimeZone(parsed.iso, tz)}: this time happens twice when the clocks go back; the first one is used.`
                : `Business time in ${tz}, whatever your device's time zone.`}
          </p>
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
