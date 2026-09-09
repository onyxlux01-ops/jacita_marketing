"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { createService, updateService } from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ServiceValues = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
  duration_minutes: number | null;
  target_audience: string | null;
  is_featured: boolean;
  is_promotion: boolean;
  is_active: boolean;
};

export function ServiceForm({
  organisationId,
  service,
  onDone,
}: {
  organisationId: string;
  service?: ServiceValues;
  onDone?: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const editing = Boolean(service);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("organisation_id", organisationId);
    if (service) formData.set("service_id", service.id);

    startTransition(async () => {
      const res = editing
        ? await updateService(formData)
        : await createService(formData);
      if (res.error) toast.error(res.error);
      else {
        toast.success(editing ? "Service updated" : "Service created");
        if (!editing) form.reset();
        onDone?.();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder="e.g. Classic cut & style"
          defaultValue={service?.name ?? ""}
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          rows={2}
          defaultValue={service?.description ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Input
          id="category"
          name="category"
          placeholder="Hair, Food, Fitness…"
          defaultValue={service?.category ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="price">Price</Label>
        <Input
          id="price"
          name="price"
          type="number"
          step="0.01"
          min="0"
          defaultValue={service?.price ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="duration_minutes">Duration (minutes)</Label>
        <Input
          id="duration_minutes"
          name="duration_minutes"
          type="number"
          min="0"
          defaultValue={service?.duration_minutes ?? ""}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="target_audience">Target audience</Label>
        <Input
          id="target_audience"
          name="target_audience"
          placeholder="Who this is for"
          defaultValue={service?.target_audience ?? ""}
        />
      </div>
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2 sm:pb-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_featured"
            className="size-4 rounded border"
            defaultChecked={service?.is_featured}
          />
          Featured
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_promotion"
            className="size-4 rounded border"
            defaultChecked={service?.is_promotion}
          />
          Promotion
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="is_active"
            className="size-4 rounded border"
            defaultChecked={service?.is_active ?? true}
          />
          Active
        </label>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {editing ? "Save changes" : "Add service"}
        </Button>
      </div>
    </form>
  );
}
