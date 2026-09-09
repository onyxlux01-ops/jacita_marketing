import Link from "next/link";
import { cn } from "@/lib/utils";

const SECTIONS = [
  { id: "business", label: "Business Profile" },
  { id: "brand", label: "Brand" },
  { id: "services", label: "Services" },
  { id: "audience", label: "Audience" },
  { id: "goals", label: "Marketing Goals" },
  { id: "social", label: "Social Accounts" },
  { id: "team", label: "Team" },
  { id: "publishing", label: "Publishing" },
  { id: "danger", label: "Danger Zone" },
] as const;

export function SettingsNav({ current }: { current: string }) {
  return (
    <nav className="flex flex-wrap gap-1.5">
      {SECTIONS.map((s) => (
        <Link
          key={s.id}
          href={`/app/settings?section=${s.id}`}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-xs font-medium",
            current === s.id
              ? "bg-primary/15 text-primary"
              : "bg-muted/70 text-muted-foreground hover:text-foreground"
          )}
        >
          {s.label}
        </Link>
      ))}
    </nav>
  );
}
