"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { retryFailedPublish } from "@/app/(app)/app/actions/social";
import { Button } from "@/components/ui/button";
import { PlatformPill } from "@/components/content/platform-icons";
import type { SocialPlatform } from "@/lib/types";
import { format } from "date-fns";

type Log = {
  id: string;
  platform: SocialPlatform;
  status: string;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  external_post_id: string | null;
  content_id: string | null;
  social_account_id: string | null;
};

export function PublishHistory({ logs }: { logs: Log[] }) {
  const [pending, startTransition] = useTransition();

  if (!logs.length) {
    return (
      <section>
        <h2 className="font-heading text-lg font-semibold">Publishing history</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Publish attempts for this business will appear here.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="font-heading text-lg font-semibold">Publishing history</h2>
      <ul className="mt-4 divide-y divide-border/70 border-y border-border/70">
        {logs.map((log) => (
          <li
            key={log.id}
            className="flex flex-wrap items-center justify-between gap-3 py-4"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2">
                <PlatformPill platform={log.platform} />
                <span className="text-sm font-medium capitalize">
                  {log.status}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(log.completed_at || log.started_at), "PPp")}
              </p>
              {log.error_message ? (
                <p className="text-xs text-destructive">{log.error_message}</p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              {log.content_id ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/app/content/${log.content_id}`}>Open</Link>
                </Button>
              ) : null}
              {log.status === "failed" &&
              log.content_id &&
              log.social_account_id ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    startTransition(async () => {
                      const res = await retryFailedPublish({
                        contentId: log.content_id!,
                        socialAccountId: log.social_account_id!,
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
        ))}
      </ul>
    </section>
  );
}
