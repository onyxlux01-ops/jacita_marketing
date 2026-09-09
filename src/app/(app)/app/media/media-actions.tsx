"use client";

import { useTransition } from "react";
import { Heart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteMediaAsset,
  toggleMediaFavourite,
} from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MediaAssetActions({
  mediaId,
  isFavourite,
}: {
  mediaId: string;
  isFavourite: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex gap-1">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8"
        disabled={pending}
        aria-label={isFavourite ? "Unfavourite" : "Favourite"}
        onClick={() => {
          startTransition(async () => {
            const res = await toggleMediaFavourite(mediaId);
            if (res.error) toast.error(res.error);
          });
        }}
      >
        <Heart
          className={cn(
            "size-3.5",
            isFavourite && "fill-primary text-primary"
          )}
        />
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-8 text-destructive"
        disabled={pending}
        aria-label="Delete media"
        onClick={() => {
          if (!confirm("Remove this media asset?")) return;
          startTransition(async () => {
            const res = await deleteMediaAsset(mediaId);
            if (res.error) toast.error(res.error);
            else toast.success("Media removed");
          });
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}
