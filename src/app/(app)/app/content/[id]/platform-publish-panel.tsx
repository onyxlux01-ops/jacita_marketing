"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { publishContentNow, retryFailedPublish } from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { PlatformPill } from "@/components/content/platform-icons";
import { describePublishOutcome } from "@/lib/content/publish-outcome";
import { formatInTimeZone } from "@/lib/timezone";
import type { ContentStatus, PlatformPublishStatus, SocialPlatform } from "@/lib/types";

export type PlatformRow = {
  id: string;
  platform: SocialPlatform;
  publish_status: PlatformPublishStatus | string;
  scheduled_at: string | null;
  published_at: string | null;
  external_post_id: string | null;
  error_message: string | null;
  social_account_id: string | null;
  account_handle: string | null;
  account_name: string | null;
  connection_status: string | null;
};

type Outcome = ReturnType<typeof describePublishOutcome>;

export function PlatformPublishPanel({ contentId, rows, contentStatus, canPublish, timeZone }: {
  contentId: string;
  rows: PlatformRow[];
  contentStatus: ContentStatus;
  canPublish: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const approved = ["approved", "scheduled", "failed"].includes(contentStatus);

  function publish(row: PlatformRow) {
    startTransition(async () => {
      let outcome: Outcome;
      try {
        const action = row.publish_status === "failed" ? retryFailedPublish : publishContentNow;
        const result = await action({ contentId, socialAccountId: row.social_account_id!, contentPlatformId: row.id });
        outcome = describePublishOutcome(result);
      } catch {
        outcome = { tone: "error", message: "The publishing request could not be confirmed. Check Automation → Publishing before trying again." };
      }
      setOutcomes((previous) => ({ ...previous, [row.id]: outcome }));
      if (outcome.tone === "error") toast.error(outcome.message);
      else if (outcome.tone === "success") toast.success(outcome.message);
      else toast.info(outcome.message);
      router.refresh();
    });
  }

  if (!rows.length) return <p className="text-sm text-muted-foreground">No platforms selected for this content.</p>;
  return (
    <div className="space-y-3">
      {!canPublish ? <p className="text-sm text-muted-foreground">Only owners and managers can publish.</p> : !approved ? <p className="text-sm text-muted-foreground">Approve this content before publishing.</p> : null}
      <ul className="divide-y divide-border/70">
        {rows.map((row) => {
          const connected = Boolean(row.social_account_id) && row.connection_status === "connected";
          const eligible = connected && canPublish && approved && ["approved", "scheduled", "failed", "draft"].includes(row.publish_status);
          const outcome = outcomes[row.id];
          return (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <PlatformPill platform={row.platform} />
                  <span className="text-sm font-medium capitalize">{row.publish_status}</span>
                </div>
                <p className="break-words text-sm text-muted-foreground">{row.account_handle || row.account_name || "No account linked"}</p>
                {!connected ? <Link href="/app/social" className="inline-flex min-h-11 items-center text-sm underline">{row.social_account_id ? "Reconnect account" : "Connect account"}</Link> : null}
                {row.publish_status === "held" || row.publish_status === "uncertain" ? (
                  <p className="text-sm text-muted-foreground">{row.publish_status === "uncertain" ? "This attempt may already be live. Check the provider before retrying." : "This post is on hold. Review the reason before re-approving."} <Link href="/app/automation" className="underline">Review publishing</Link></p>
                ) : null}
                {row.scheduled_at ? <p className="text-xs text-muted-foreground">Scheduled {formatInTimeZone(row.scheduled_at, timeZone)}</p> : null}
                {row.published_at ? <p className="text-xs text-muted-foreground">Published {formatInTimeZone(row.published_at, timeZone)}</p> : null}
                {row.external_post_id ? <p className="break-all text-xs text-muted-foreground">Provider reference: {row.external_post_id}</p> : null}
                {row.error_message ? <p className="text-sm text-destructive">{row.error_message}</p> : null}
                {outcome ? <div role={outcome.tone === "error" ? "alert" : "status"} className="space-y-1 text-sm">
                  <p>{outcome.message}</p>
                  {outcome.url ? <a href={outcome.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center underline">Open published post</a> : null}
                </div> : null}
              </div>
              {eligible ? <Button variant="outline" className="min-h-11" disabled={pending} onClick={() => publish(row)}>{pending ? "Checking publication…" : row.publish_status === "failed" ? "Retry publication" : "Publish now"}</Button> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
