import { cn } from "@/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <Card className={cn("items-center py-10 text-center", className)} size="sm">
      <CardHeader className="items-center px-6">
        {Icon ? (
          <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-accent text-primary">
            <Icon className="size-5" />
          </div>
        ) : null}
        <CardTitle className="font-heading text-lg font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription className="max-w-md text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      {(exampleHint || action) && (
        <CardContent className="flex flex-col items-center gap-4 px-6">
          {exampleHint ? (
            <p className="max-w-sm text-xs text-muted-foreground/80">
              {exampleHint}
            </p>
          ) : null}
          {action}
        </CardContent>
      )}
    </Card>
  );
}
