import { cn } from "@/lib/utils";

export function EmptyState({
  title,
  description,
  action,
  exampleHint,
  className,
  icon: Icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  exampleHint?: string;
  className?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div
      className={cn(
        "jacita-panel flex flex-col items-center rounded-xl px-6 py-12 text-center",
        className
      )}
    >
      {Icon ? (
        <div className="mb-4 flex size-11 items-center justify-center rounded-full bg-accent text-primary">
          <Icon className="size-5" />
        </div>
      ) : null}
      <h3 className="font-heading text-lg font-semibold tracking-tight">
        {title}
      </h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
        {description}
      </p>
      {exampleHint ? (
        <p className="mt-3 max-w-sm text-xs text-muted-foreground/80">
          {exampleHint}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
