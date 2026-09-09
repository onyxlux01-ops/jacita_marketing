"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  publishContentNow,
  retryFailedPublish,
} from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { PlatformPill } from "@/components/content/platform-icons";
import type { PlatformPublishStatus, SocialPlatform } from "@/lib/types";
import { format } from "date-fns";

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

export function PlatformPublishPanel({
  contentId,
  rows,
}: {
  contentId: string;
  rows: PlatformRow[];
}) {
  const [pending, startTransition] = useTransition();

  if (!rows.length) {
    return (
      <p className="text-sm text-muted-foreground">
        No platforms selected for this content.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border/70">
      {rows.map((row) => {
        const connected = row.connection_status === "connected";
        const canPublish = Boolean(row.social_account_id) && connected;
        const failed = row.publish_status === "failed";

        return (
          <li
            key={row.id}
            className="flex flex-wrap items-start justify-between gap-3 py-4 first:pt-0 last:pb-0"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <PlatformPill platform={row.platform} />
                <span className="text-sm font-medium capitalize">
                  {row.publish_status}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {row.account_handle || row.account_name || "No account linked"}
                {!connected && row.social_account_id
                  ? " · disconnected"
                  : !row.social_account_id
                    ? " · connect in Social Accounts"
                    : ""}
              </p>
              {row.scheduled_at ? (
                <p className="text-xs text-muted-foreground">
                  Scheduled {format(new Date(row.scheduled_at), "PPp")}
                </p>
              ) : null}
              {row.published_at ? (
                <p className="text-xs text-muted-foreground">
                  Published {format(new Date(row.published_at), "PPp")}
                </p>
              ) : null}
              {row.error_message ? (
                <p className="text-xs text-destructive">{row.error_message}</p>
              ) : null}
            </div>
            <div className="flex gap-2">
              {canPublish &&
              ["approved", "scheduled", "failed", "draft"].includes(
                row.publish_status
              ) ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await publishContentNow({
                        contentId,
                        socialAccountId: row.social_account_id!,
                        contentPlatformId: row.id,
                      });
                      if ("error" in res && res.error) toast.error(res.error);
                      else toast.success("Publish started");
                    });
                  }}
                >
                  Publish now
                </Button>
              ) : null}
              {failed && canPublish ? (
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await retryFailedPublish({
                        contentId,
                        socialAccountId: row.social_account_id!,
                        contentPlatformId: row.id,
                      });
                      if ("error" in res && res.error) toast.error(res.error);
                      else toast.success("Retry started");
                    });
                  }}
                >
                  Retry
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
