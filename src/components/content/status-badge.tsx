import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/types";

const STATUS_STYLES: Record<
  ContentStatus,
  { label: string; className: string }
> = {
  draft: {
    label: "Draft",
    className: "bg-slate-100 text-slate-700 border-slate-200",
  },
  review: {
    label: "In review",
    className: "bg-amber-50 text-amber-800 border-amber-200",
  },
  approved: {
    label: "Approved",
    className: "bg-teal-50 text-teal-800 border-teal-200",
  },
  scheduled: {
    label: "Scheduled",
    className: "bg-sky-50 text-sky-800 border-sky-200",
  },
  publishing: {
    label: "Publishing",
    className: "bg-indigo-50 text-indigo-800 border-indigo-200",
  },
  published: {
    label: "Published",
    className: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  failed: {
    label: "Failed",
    className: "bg-red-50 text-red-800 border-red-200",
  },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ContentStatus | string;
  className?: string;
}) {
  const style = STATUS_STYLES[status as ContentStatus] ?? {
    label: status,
    className: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={cn("capitalize", style.className, className)}
    >
      {style.label}
    </Badge>
  );
}
