"use client";

import { useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { registerUploadedMediaAssets } from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  MEDIA_ACCEPT,
  uploadFilesToMediaBucket,
} from "@/lib/media/upload-media-client";

const CATEGORY_OPTIONS = [
  "Service",
  "Promotion",
  "Before & After",
  "Staff",
  "Behind the Scenes",
  "Brand",
  "Other",
] as const;

export function MediaUploadForm({ organisationId }: { organisationId: string }) {
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const files = Array.from(
      (form.elements.namedItem("file") as HTMLInputElement)?.files ?? []
    ).filter((f) => f.size > 0);
    const description =
      (form.elements.namedItem("description") as HTMLInputElement)?.value ||
      null;
    const category =
      (form.elements.namedItem("category") as HTMLSelectElement)?.value || null;

    if (!files.length) {
      toast.error("Choose at least one file");
      return;
    }

    startTransition(async () => {
      try {
        const { uploads, error: uploadError } = await uploadFilesToMediaBucket(
          organisationId,
          files
        );
        if (uploadError || !uploads.length) {
          toast.error(uploadError || "Upload failed");
          return;
        }

        const res = await registerUploadedMediaAssets({
          organisationId,
          storagePaths: uploads.map((u) => ({
            storagePath: u.storagePath,
            mediaType: u.mediaType,
          })),
          category,
          description,
        });

        if (res.error) {
          toast.error(res.error);
          return;
        }

        toast.success(res.count && res.count > 1 ? `Uploaded ${res.count}` : "Uploaded");
        form.reset();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Upload failed unexpectedly";
        toast.error(
          /body|1 ?mb|limit|413/i.test(message)
            ? "File is too large for this upload path. Try a smaller JPEG/PNG, or refresh and retry."
            : message
        );
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end"
    >
      <div className="space-y-2">
        <Label htmlFor="file">File</Label>
        <Input
          id="file"
          name="file"
          type="file"
          accept={MEDIA_ACCEPT}
          required
        />
        <p className="text-xs text-muted-foreground">
          JPEG, PNG, WebP, GIF, MP4, MOV, WebM · max 50 MB
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input
          id="description"
          name="description"
          placeholder="Optional label"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <select
          id="category"
          name="category"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          defaultValue=""
        >
          <option value="">Uncategorised</option>
          {CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Upload className="size-4" />
        )}
        Upload
      </Button>
    </form>
  );
}
