"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";

export function AnalyticsActions({
  organisationId,
}: {
  organisationId: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(path: string, label: string) {
    startTransition(async () => {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organisation_id: organisationId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || `Could not ${label}`);
        return;
      }
      toast.success(`${label} ready`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run("/api/ai/insights", "Performance analysis")}
      >
        Analyse performance
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => run("/api/ai/weekly-review", "Weekly review")}
      >
        Weekly review
      </Button>
    </div>
  );
}
