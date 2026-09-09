"use client";

import Link from "next/link";
import { Bell, Menu, Plus } from "lucide-react";
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
}: {
  organisations: OrganisationSummary[];
  active: OrganisationSummary | null;
  user: AppUser | null;
  unreadCount?: number;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border/60 bg-background/90 px-4 backdrop-blur-md sm:px-6">
      <div className="flex min-w-0 items-center gap-2 lg:hidden">
        <Sheet>
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
            <div className="flex h-full flex-col">
              <AppSidebar
                organisations={organisations}
                active={active}
                className="flex h-full w-full"
              />
            </div>
          </SheetContent>
        </Sheet>
        <BusinessSwitcher
          organisations={organisations}
          active={active}
          variant="compact"
        />
      </div>

      <div className="hidden min-w-0 lg:block">
        <p className="truncate text-sm text-muted-foreground">
          {active ? active.name : "Create a business to begin"}
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        <Button asChild size="sm" className="hidden sm:inline-flex">
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
          </PopoverContent>
        </Popover>
        <UserMenu user={user} />
      </div>
    </header>
  );
}
