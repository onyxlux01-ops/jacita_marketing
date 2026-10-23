"use client";

import Link from "next/link";
import { Bell, CalendarDays, ChevronRight, Menu, Plus } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { AppUser, OrganisationSummary } from "@/lib/org";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AppSidebar } from "@/components/layout/app-sidebar";

export function AppTopbar({
  organisations,
  active,
  user,
  unreadCount = 0,
  attentionCount = null,
}: {
  organisations: OrganisationSummary[];
  active: OrganisationSummary | null;
  user: AppUser | null;
  unreadCount?: number;
  attentionCount?: number | null;
}) {
  const canAddBusiness = Boolean(user?.is_platform_admin);
  const pathname = usePathname();
  const section = pathname.split("/")[2];
  const title =
    (
      {
        content: "Content Studio",
        businesses: "Businesses",
        calendar: "Calendar",
        automation: "Automation",
        analytics: "Analytics",
        settings: "Settings",
        social: "Social accounts",
        media: "Media",
        services: "Services",
        campaigns: "Campaigns",
        onboarding: "Business setup",
      } as Record<string, string>
    )[section] ?? "Overview";
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <header className="workspace-topbar jacita-chrome sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border/60">
      <div className="flex min-w-0 flex-1 items-center gap-2 lg:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Open menu">
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="left"
            className="w-[280px] border-0 bg-sidebar p-0 text-sidebar-foreground"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            <div
              className="workspace-theme dark flex h-full flex-col"
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("a"))
                  setMenuOpen(false);
              }}
            >
              <AppSidebar
                organisations={organisations}
                active={active}
                canAddBusiness={canAddBusiness}
                className="flex h-full w-full"
              />
            </div>
          </SheetContent>
        </Sheet>
        <BusinessSwitcher
          organisations={organisations}
          active={active}
          variant="compact"
          canAddBusiness={canAddBusiness}
        />
      </div>

      <div className="topbar-breadcrumb">
        <span>Workspace</span>
        <ChevronRight size={12} />
        <strong>{title}</strong>
        <span className="hidden xl:inline">
          / {active?.name ?? "Select a business"}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {attentionCount !== null && (
          <Link href="/app#weekly-review" className="topbar-attention">
            <span className="signal-dot" />
            {attentionCount}
            <span className="hidden sm:inline"> to review</span>
            <span className="sr-only"> content items need review</span>
          </Link>
        )}
        <span className="topbar-date mr-4">
          <CalendarDays size={13} />
          {new Date().toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "Europe/London",
          })}
        </span>
        <Button asChild size="sm" className="min-h-11">
          <Link href="/app/content/new">
            <Plus className="size-3.5" />
            Create
          </Link>
        </Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="relative">
              <Bell className="size-4" />
              {unreadCount > 0 ? (
                <span className="absolute top-1.5 right-1.5 size-1.5 rounded-full bg-primary" />
              ) : null}
              <span className="sr-only">Notifications</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-4">
            <p className="font-heading text-sm font-semibold">Notifications</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {unreadCount > 0
                ? `You have ${unreadCount} unread item${unreadCount === 1 ? "" : "s"}.`
                : "You're all caught up."}
            </p>
            <Link
              href="/app/automation"
              className="mt-3 inline-flex min-h-9 items-center text-sm text-primary"
            >
              Open activity & publishing queue →
            </Link>
          </PopoverContent>
        </Popover>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
