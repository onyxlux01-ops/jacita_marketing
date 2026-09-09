import Link from "next/link";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { StatusBadge } from "@/components/content/status-badge";
import { PlatformIcons } from "@/components/content/platform-icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getActiveOrganisation, getUserOrganisations } from "@/lib/org";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import type { ContentStatus, SocialPlatform } from "@/lib/types";

type CalItem = {
  id: string;
  title: string | null;
  status: ContentStatus;
  scheduled_at: string | null;
  content_type: string | null;
  hook: string | null;
  platforms: SocialPlatform[];
  accountAlert: boolean;
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const currentView = view === "month" ? "month" : "week";

  const orgs = await getUserOrganisations();
  const active = await getActiveOrganisation(orgs);
  const today = new Date();

  let items: CalItem[] = [];
  let disconnectedAccounts = 0;
  if (active && hasSupabaseEnv()) {
    try {
      const supabase = await createClient();
      const [{ data }, { data: accounts }] = await Promise.all([
        supabase
          .from("content")
          .select(
            "id, title, status, scheduled_at, content_type, hook, content_platforms(platform, publish_status, social_account_id)"
          )
          .eq("organisation_id", active.id)
          .not("scheduled_at", "is", null)
          .in("status", [
            "scheduled",
            "publishing",
            "published",
            "failed",
            "approved",
          ]),
        supabase
          .from("social_accounts")
          .select("id, connection_status")
          .eq("organisation_id", active.id),
      ]);

      const accountStatus = Object.fromEntries(
        (accounts ?? []).map((a) => [a.id, a.connection_status])
      );
      disconnectedAccounts = (accounts ?? []).filter(
        (a) => a.connection_status !== "connected"
      ).length;

      items =
        data?.map((row) => {
          const platformsRaw = (
            row as {
              content_platforms?: Array<{
                platform: SocialPlatform;
                publish_status?: string | null;
                social_account_id?: string | null;
              }> | null;
            }
          ).content_platforms;
          const accountAlert = (platformsRaw ?? []).some((p) => {
            if (!p.social_account_id) return row.status === "scheduled";
            return accountStatus[p.social_account_id] !== "connected";
          });
          return {
            id: row.id,
            title: row.title,
            status: row.status as ContentStatus,
            scheduled_at: row.scheduled_at,
            content_type: row.content_type,
            hook: row.hook,
            platforms: (platformsRaw ?? []).map((p) => p.platform),
            accountAlert:
              accountAlert &&
              (row.status === "scheduled" || row.status === "failed"),
          };
        }) ?? [];
    } catch {
      items = [];
    }
  }

  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({
    start: weekStart,
    end: addDays(weekStart, 6),
  });

  const monthStart = startOfMonth(today);
  const monthGridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const monthGridEnd = endOfWeek(endOfMonth(today), { weekStartsOn: 1 });
  const monthDays = eachDayOfInterval({
    start: monthGridStart,
    end: monthGridEnd,
  });

  function itemsForDay(day: Date) {
    const key = format(day, "yyyy-MM-dd");
    return items.filter(
      (i) =>
        i.scheduled_at && format(new Date(i.scheduled_at), "yyyy-MM-dd") === key
    );
  }

  return (
    <div className="jacita-page jacita-enter max-w-7xl">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="jacita-label">Planning</p>
          <h1 className="mt-2 font-heading text-[1.75rem] font-semibold tracking-tight">
            Calendar
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Editorial schedule for {active?.name ?? "your business"}
          </p>
          {items.some((i) => i.accountAlert) ? (
            <p className="mt-2 text-sm text-destructive">
              Some scheduled posts cannot publish because a social account is
              disconnected.{" "}
              <Link href="/app/social" className="underline">
                Fix connections
              </Link>
            </p>
          ) : disconnectedAccounts > 0 && items.length > 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Check Social Accounts if a channel shows as not connected.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-muted/80 p-1">
            <Link
              href="/app/calendar?view=week"
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm transition-colors",
                currentView === "week"
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              Week
            </Link>
            <Link
              href="/app/calendar?view=month"
              className={cn(
                "rounded-md px-3.5 py-1.5 text-sm transition-colors",
                currentView === "month"
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground"
              )}
            >
              Month
            </Link>
          </div>
          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/app/content/new">Schedule new</Link>
          </Button>
        </div>
      </header>

      {currentView === "week" ? (
        <section className="jacita-panel overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-4">
            <h2 className="font-heading text-lg font-semibold">
              Week of {format(weekStart, "MMM d, yyyy")}
            </h2>
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No scheduled posts yet - approve content to fill the week.
              </p>
            ) : null}
          </div>
          <div className="grid gap-px bg-border/60 md:grid-cols-7">
            {weekDays.map((day) => {
              const dayItems = itemsForDay(day);
              const isToday = isSameDay(day, today);
              return (
                <div key={day.toISOString()} className="min-h-44 bg-card p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium text-muted-foreground">
                      {format(day, "EEE")}
                    </p>
                    <span
                      className={cn(
                        "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                        isToday
                          ? "bg-primary text-primary-foreground"
                          : "text-foreground"
                      )}
                    >
                      {format(day, "d")}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {dayItems.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/app/content/${item.id}`}
                          className="block overflow-hidden rounded-xl bg-muted/60 transition-colors hover:bg-accent"
                        >
                          <div className="h-14 bg-gradient-to-br from-primary/20 via-muted to-accent/40" />
                          <div className="space-y-1.5 p-2.5">
                            <PlatformIcons
                              platforms={item.platforms}
                              className="origin-left scale-90"
                            />
                            <p className="line-clamp-2 text-[11px] font-medium leading-snug">
                              {item.title || item.hook || "Untitled"}
                            </p>
                            <div className="flex items-center justify-between gap-1">
                              <span className="font-mono text-[10px] text-muted-foreground">
                                {item.scheduled_at
                                  ? format(new Date(item.scheduled_at), "HH:mm")
                                  : "--:--"}
                              </span>
                              <StatusBadge
                                status={item.status}
                                className="origin-right scale-90"
                              />
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                    {dayItems.length === 0 ? (
                      <li className="rounded-lg border border-dashed border-border/70 px-2 py-3 text-center text-[10px] text-muted-foreground/70">
                        Open
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="jacita-panel overflow-hidden rounded-2xl p-4 sm:p-5">
          <h2 className="mb-4 font-heading text-lg font-semibold">
            {format(today, "MMMM yyyy")}
          </h2>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted-foreground">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {monthDays.map((day) => {
              const dayItems = itemsForDay(day);
              const inMonth = isSameMonth(day, today);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    "min-h-22 rounded-xl p-1.5",
                    inMonth ? "bg-muted/40" : "opacity-40"
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] font-medium",
                      isSameDay(day, today) ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {dayItems.slice(0, 2).map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/app/content/${item.id}`}
                          className="block truncate rounded-md bg-card px-1.5 py-1 text-[10px] font-medium shadow-sm hover:text-primary"
                        >
                          {item.title || "Untitled"}
                        </Link>
                      </li>
                    ))}
                    {dayItems.length > 2 ? (
                      <li className="px-1 text-[10px] text-muted-foreground">
                        +{dayItems.length - 2}
                      </li>
                    ) : null}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
