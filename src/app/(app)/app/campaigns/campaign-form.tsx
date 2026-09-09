"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { createCampaign } from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function CampaignForm({ organisationId }: { organisationId: string }) {
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set("organisation_id", organisationId);

    startTransition(async () => {
      const res = await createCampaign(formData);
      if (res.error) toast.error(res.error);
      else {
        toast.success("Campaign created");
        form.reset();
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Summer booking push" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="objective">Objective</Label>
        <Input id="objective" name="objective" placeholder="Increase weekday bookings" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" name="description" rows={2} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="start_date">Start date</Label>
        <Input id="start_date" name="start_date" type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="end_date">End date</Label>
        <Input id="end_date" name="end_date" type="date" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="budget">Budget</Label>
        <Input id="budget" name="budget" type="number" min="0" step="0.01" placeholder="0.00" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="target_audience">Target audience</Label>
        <Input id="target_audience" name="target_audience" placeholder="Who this campaign reaches" />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          Create campaign
        </Button>
      </div>
    </form>
  );
}
