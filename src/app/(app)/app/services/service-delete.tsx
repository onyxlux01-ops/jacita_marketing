"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { deleteService } from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";

export function ServiceDeleteButton({ serviceId }: { serviceId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={pending}
      className="text-destructive hover:text-destructive"
      onClick={() => {
        startTransition(async () => {
          const res = await deleteService(serviceId);
          if (res.error) toast.error(res.error);
          else toast.success("Deleted");
        });
      }}
    >
      Delete
    </Button>
  );
}
