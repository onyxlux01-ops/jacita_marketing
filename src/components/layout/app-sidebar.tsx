"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  CalendarDays,
  Home,
  ImageIcon,
  Megaphone,
  Settings,
  Share2,
  Sparkles,
  Zap,
} from "lucide-react";
import type { OrganisationSummary } from "@/lib/org";
import { BusinessSwitcher } from "@/components/layout/business-switcher";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { href: "/app", label: "Home", icon: Home, exact: true },
  { href: "/app/automation", label: "Automation", icon: Zap },
  { href: "/app/content", label: "Content", icon: Sparkles },
  { href: "/app/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/app/media", label: "Media", icon: ImageIcon },
  { href: "/app/services", label: "Services", icon: Briefcase },
  { href: "/app/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/app/analytics", label: "Analytics", icon: BarChart3 },
] as const;

const SECONDARY = [
  { href: "/app/social", label: "Social Accounts", icon: Share2 },
  { href: "/app/settings", label: "Business Settings", icon: Settings },
] as const;

function NavLink({
  href,
  label,
  icon: Icon,
  exact,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "jacita-press group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground/65 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
      )}
    >
      <Icon
        className={cn(
          "size-[15px] shrink-0 transition-colors",
          active
            ? "text-sidebar-primary"
            : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/80"
        )}
      />
      {label}
    </Link>
  );
}

export function AppSidebar({
  organisations,
  active,
  className,
}: {
  organisations: OrganisationSummary[];
  active: OrganisationSummary | null;
  className?: string;
}) {
  return (
    <aside
      className={cn(
        "w-[240px] shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        className ?? "hidden lg:flex"
      )}
    >
      <div className="flex h-14 items-center px-4">
        <Link
          href="/app"
          className="font-heading text-[17px] font-semibold tracking-tight text-sidebar-foreground"
        >
          Jacita
        </Link>
      </div>

      <div className="px-2 pb-3">
        <BusinessSwitcher organisations={organisations} active={active} />
      </div>

      <div className="mx-4 h-px bg-sidebar-border" />

      <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-2 py-4">
        <div className="space-y-0.5">
          <p className="jacita-label mb-2 px-2.5 text-sidebar-foreground/35">
            Workspace
          </p>
          {PRIMARY.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>
        <div className="space-y-0.5">
          <p className="jacita-label mb-2 px-2.5 text-sidebar-foreground/35">
            Business
          </p>
          {SECONDARY.map((item) => (
            <NavLink key={item.href} {...item} />
          ))}
        </div>
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="text-[11px] leading-relaxed text-sidebar-foreground/40">
          AI marketing workspace
        </p>
      </div>
    </aside>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const items: Array<{
    href: string;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    exact?: boolean;
  }> = [
    PRIMARY[0],
    PRIMARY[1],
    PRIMARY[2],
    PRIMARY[3],
    PRIMARY[6],
  ];

  return (
    <nav className="jacita-dock fixed inset-x-0 bottom-0 z-40 border-t border-border/60 lg:hidden">
      <ul className="mx-auto flex max-w-lg items-stretch justify-between px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                className={cn(
                  "jacita-press flex flex-col items-center gap-1 px-1 py-2.5 text-[10px] font-medium",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
