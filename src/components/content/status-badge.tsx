import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ContentStatus } from "@/lib/types";

const STATUS_META: Record<
  ContentStatus,
  {
    label: string;
    variant: "muted" | "warning" | "success" | "info" | "destructive" | "secondary";
  }
> = {
  draft: { label: "Draft", variant: "muted" },
  review: { label: "In review", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  scheduled: { label: "Scheduled", variant: "info" },
  publishing: { label: "Publishing", variant: "secondary" },
  published: { label: "Published", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

export function StatusBadge({
  status,
  className,
}: {
  status: ContentStatus | string;
  className?: string;
}) {
  const meta = STATUS_META[status as ContentStatus] ?? {
    label: status,
    variant: "muted" as const,
  };

  return (
    <Badge variant={meta.variant} className={cn("capitalize", className)}>
      {meta.label}
    </Badge>
  );
}
