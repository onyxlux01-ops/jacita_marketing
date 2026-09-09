"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { toast } from "sonner";
import { retryFailedPublishJob } from "@/app/(app)/app/actions/publishing";
import { PlatformPill } from "@/components/content/platform-icons";
import { Button } from "@/components/ui/button";
import { humanPublishMessage } from "@/lib/social/errors";
import type { SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

type Dashboard = Awaited<
  ReturnType<typeof import("@/lib/social/publishing-dashboard").getPublishingDashboard>
>;

function statusBucket(status: string) {
  if (status === "published") return "COMPLETED";
  if (status === "processing") return "PROCESSING";
  if (status === "failed" || status === "expired") return "FAILED";
  return "READY";
}

export function PublishingReliabilityPanel({
  organisationId,
  timezone,
  data,
}: {
  organisationId: string;
  timezone: string;
  data: Dashboard;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const ready = data.queue.filter((q) =>
    ["pending", "ready", "retrying"].includes(q.status)
  );
  const processing = data.queue.filter((q) => q.status === "processing");
  const completed = data.queue.filter((q) => q.status === "published").slice(-5);
  const failed = data.failed;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold">Publishing</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Times shown for {timezone}. Jobs run on the server — the browser
            does not need to stay open.
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-4 rounded-xl border border-border/70 bg-card px-4 py-4">
        <div>
          <dt className="text-xs text-muted-foreground">Today</dt>
          <dd className="mt-1 text-sm font-medium">
            ✓ {data.today.published} published
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Scheduled</dt>
          <dd className="mt-1 text-sm font-medium">
            ◷ {data.today.scheduled} scheduled
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Attention</dt>
          <dd
            className={cn(
              "mt-1 text-sm font-medium",
              data.today.needsAttention > 0 && "text-amber-800"
            )}
          >
            ⚠ {data.today.needsAttention} needs attention
          </dd>
        </div>
      </dl>

      <div>
        <p className="text-xs font-medium text-muted-foreground">Accounts</p>
        <ul className="mt-2 space-y-2">
          {data.health.map((h) => (
            <li
              key={h.platform}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="inline-flex items-center gap-2">
                <PlatformPill platform={h.platform} />
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    h.health === "healthy" || h.health === "connected"
                      ? "bg-emerald-500"
                      : h.health === "reauth_required" ||
                          h.health === "attention" ||
                          h.health === "not_configured"
                        ? "bg-amber-500"
                        : "bg-muted-foreground/40"
                  )}
                />
                <span>{h.label}</span>
              </span>
              {h.health === "reauth_required" ||
              h.health === "disconnected" ||
              h.health === "not_configured" ? (
                <Link
                  href="/app/social"
                  className="text-xs font-medium text-primary hover:underline"
                >
                  {h.health === "not_configured" ? "Configure" : "Reconnect"}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {failed.length > 0 ? (
        <div className="space-y-3 rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-4">
          <h4 className="text-sm font-semibold text-amber-950">
            Publishing failed
          </h4>
          <ul className="space-y-3">
            {failed.map((f) => (
              <li key={f.id} className="text-sm">
                <p className="font-medium capitalize">{f.platform}</p>
                <p className="text-muted-foreground">{f.title}</p>
                <p className="mt-1 text-amber-900">{f.reason}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const res = await retryFailedPublishJob({
                          organisationId,
                          jobId: f.id,
                        });
                        if ("error" in res && res.error) toast.error(res.error);
                        else {
                          toast.success("Retry started");
                          router.refresh();
                        }
                      })
                    }
                  >
                    Retry safely
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link href="/app/social">Reconnect account</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-muted-foreground">Queue</p>
          <div className="mt-2 space-y-4 text-sm">
            {(
              [
                ["READY", ready],
                ["PROCESSING", processing],
                ["COMPLETED", completed],
                ["FAILED", failed.map((f) => ({
                  id: f.id,
                  platform: f.platform as SocialPlatform,
                  status: "failed",
                  scheduledAt: null as string | null,
                  title: f.title,
                  contentId: f.contentId,
                  errorMessage: f.reason,
                  errorType: f.errorType,
                }))],
              ] as const
            ).map(([label, items]) => (
              <div key={label}>
                <p className="font-mono text-[10px] tracking-wide text-muted-foreground">
                  {label}
                </p>
                {items.length === 0 ? (
                  <p className="mt-1 text-xs text-muted-foreground">—</p>
                ) : (
                  <ul className="mt-1 space-y-1.5">
                    {items.slice(0, 5).map((item) => (
                      <li key={item.id} className="flex justify-between gap-2">
                        <span className="capitalize">
                          {item.platform}
                          {item.scheduledAt
                            ? ` · ${format(new Date(item.scheduledAt), "HH:mm")}`
                            : ""}
                        </span>
                        <span className="truncate text-muted-foreground">
                          {"title" in item
                            ? item.title
                            : statusBucket(
                                "status" in item
                                  ? String((item as { status: string }).status)
                                  : "failed"
                              )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium text-muted-foreground">
            Recent activity
          </p>
          <ul className="mt-2 space-y-2 text-sm">
            {data.recentActivity.length === 0 ? (
              <li className="text-muted-foreground">No publish activity yet.</li>
            ) : (
              data.recentActivity.map((row) => (
                <li key={row.id}>
                  <span className="capitalize">{row.platform}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    ·{" "}
                    {row.status === "published" || row.status === "publishing"
                      ? humanPublishMessage({
                          platform: row.platform,
                          success: true,
                        })
                      : humanPublishMessage({
                          platform: row.platform,
                          errorType: row.errorType as never,
                          message: row.errorMessage,
                        })}
                  </span>
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </section>
  );
}
