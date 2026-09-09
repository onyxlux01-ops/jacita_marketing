"use client";

import { useTransition } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { uploadMediaAsset } from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
    const formData = new FormData(form);
    formData.set("organisation_id", organisationId);

    startTransition(async () => {
      const res = await uploadMediaAsset(formData);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Uploaded");
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <div className="space-y-2">
        <Label htmlFor="file">File</Label>
        <Input id="file" name="file" type="file" accept="image/*,video/*" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" placeholder="Optional label" />
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
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
        Upload
      </Button>
    </form>
  );
}
