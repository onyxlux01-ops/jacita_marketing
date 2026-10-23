"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { switchOrganisation } from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";

export function OpenBusiness({
  id,
  href = "/app",
  children,
}: {
  id: string;
  href?: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const result = await switchOrganisation(id);
            if (result.error) {
              toast.error(result.error);
              return;
            }
            router.push(href);
            router.refresh();
          } catch {
            toast.error("Could not switch business. Please try again.");
          }
        })
      }
    >
      {pending ? (
        <Loader2 size={13} className="animate-spin" />
      ) : (
        <ArrowUpRight size={13} />
      )}
      {children}
    </Button>
  );
}
