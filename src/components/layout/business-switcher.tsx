"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { switchOrganisation } from "@/app/(app)/app/actions/org";
import type { OrganisationSummary } from "@/lib/org";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

function businessMeta(org: OrganisationSummary | null) {
  if (!org) return "Select a business";
  const parts = [org.business_category, org.location].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Business";
}

export function BusinessSwitcher({
  organisations,
  active,
  variant = "sidebar",
}: {
  organisations: OrganisationSummary[];
  active: OrganisationSummary | null;
  variant?: "sidebar" | "compact" | "page";
}) {
  const [pending, startTransition] = useTransition();
  const subtitle = businessMeta(active);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          "jacita-press group text-left outline-none transition-colors",
          variant === "sidebar" &&
            "w-full rounded-lg px-2.5 py-2.5 hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          variant === "compact" &&
            "flex max-w-[220px] items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-muted/50",
          variant === "page" &&
            "w-full max-w-md rounded-lg py-1 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
          <div className="min-w-0">
            <p
              className={cn(
                "truncate font-heading font-semibold tracking-tight",
                variant === "page"
                  ? "text-2xl sm:text-[1.75rem]"
                  : "text-[15px]",
                variant === "sidebar"
                  ? "text-sidebar-foreground"
                  : "text-foreground"
              )}
            >
              {active?.name ?? "No business"}
            </p>
            <p
              className={cn(
                "mt-0.5 truncate text-sm",
                variant === "sidebar"
                  ? "text-sidebar-foreground/55"
                  : "text-muted-foreground",
                variant === "compact" && "text-xs"
              )}
            >
              {subtitle}
            </p>
          </div>
          <ChevronsUpDown
            className={cn(
              "shrink-0 opacity-45 transition-opacity group-hover:opacity-80",
              variant === "page" ? "mt-2 size-4" : "mt-1 size-3.5",
              variant === "sidebar"
                ? "text-sidebar-foreground"
                : "text-foreground"
            )}
          />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={8}
        className="w-[min(100vw-2rem,300px)]"
      >
        <DropdownMenuLabel className="text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Businesses
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {organisations.length === 0 ? (
          <DropdownMenuItem disabled>No businesses yet</DropdownMenuItem>
        ) : (
          organisations.map((org) => (
            <DropdownMenuItem
              key={org.id}
              onSelect={() => {
                startTransition(async () => {
                  await switchOrganisation(org.id);
                });
              }}
              className="flex items-start justify-between gap-3 py-2.5"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{org.name}</span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {businessMeta(org)}
                </span>
              </span>
              <Check
                className={cn(
                  "mt-0.5 size-3.5 shrink-0 text-primary",
                  active?.id === org.id ? "opacity-100" : "opacity-0"
                )}
              />
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/app/onboarding" className="flex items-center gap-2">
            <Plus className="size-3.5" />
            Add business
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
