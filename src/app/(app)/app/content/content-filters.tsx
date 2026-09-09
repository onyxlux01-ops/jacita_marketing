"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/types";

export function ContentFilters({
  current,
  tabs,
  services = [],
  campaigns = [],
}: {
  current: ContentStatus | "all";
  tabs: Array<{ id: ContentStatus | "all"; label: string }>;
  services?: Array<{ id: string; name: string }>;
  campaigns?: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function update(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (!value || value === "all" || value === "none") params.delete(key);
    else params.set(key, value);
    const q = params.toString();
    router.push(q ? `${pathname}?${q}` : pathname);
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-1 overflow-x-auto pb-1">
        {tabs.map((tab) => {
          const active = current === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => update("status", tab.id === "all" ? null : tab.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input
          defaultValue={searchParams.get("q") || ""}
          placeholder="Search title or caption…"
          className="h-9 max-w-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              update("q", (e.target as HTMLInputElement).value.trim() || null);
            }
          }}
        />
        <Select
          value={searchParams.get("platform") || "all"}
          onValueChange={(v) => update("platform", v ?? null)}
        >
          <SelectTrigger className="h-9 w-[140px]">
            <SelectValue placeholder="Platform" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="facebook">Facebook</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={searchParams.get("type") || "all"}
          onValueChange={(v) => update("type", v ?? null)}
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="image_post">Image</SelectItem>
            <SelectItem value="reel">Reel</SelectItem>
            <SelectItem value="promotional">Promotional</SelectItem>
            <SelectItem value="educational">Educational</SelectItem>
            <SelectItem value="community">Community</SelectItem>
          </SelectContent>
        </Select>
        {services.length ? (
          <Select
            value={searchParams.get("service") || "all"}
            onValueChange={(v) => update("service", v ?? null)}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Service" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All services</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        {campaigns.length ? (
          <Select
            value={searchParams.get("campaign") || "all"}
            onValueChange={(v) => update("campaign", v ?? null)}
          >
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue placeholder="Campaign" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campaigns</SelectItem>
              {campaigns.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>
    </div>
  );
}
