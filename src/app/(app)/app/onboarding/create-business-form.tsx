"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createOrganisationOnboarding } from "@/app/(app)/app/actions/onboarding";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { BUSINESS_CATEGORIES } from "@/lib/org/constants";

export function CreateBusinessForm({
  isAdditional = false,
}: {
  isAdditional?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    name: "",
    slug: "",
    business_category: "",
    description: "",
    country: "",
    location: "",
    website: "",
    booking_url: "",
    phone: "",
    email: "",
  });

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "name" && !prev.slug) {
        next.slug = value
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
      }
      return next;
    });
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Business name is required");
      return;
    }
    const formData = new FormData();
    Object.entries(form).forEach(([k, v]) => formData.set(k, v));

    startTransition(async () => {
      const res = await createOrganisationOnboarding(formData);
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <form onSubmit={onSubmit} className="jacita-panel space-y-5 rounded-2xl p-5 sm:p-6">
      <div>
        <p className="jacita-label">
          {isAdditional ? "New business" : "Get started"}
        </p>
        <h2 className="mt-2 font-heading text-lg font-semibold">
          Business details
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {isAdditional
            ? "This business stays completely separate from your existing ones."
            : "Required fields first — you can refine everything later."}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="name">Business name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="All Hair & Beauty"
            required
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="business_category">Business type</Label>
          <Select
            value={form.business_category || undefined}
            onValueChange={(value) =>
              update("business_category", value ?? "")
            }
          >
            <SelectTrigger id="business_category" className="w-full">
              <SelectValue placeholder="Select a type" />
            </SelectTrigger>
            <SelectContent>
              {BUSINESS_CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            rows={3}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="What does this business do?"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            placeholder="United Kingdom"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">City / location</Label>
          <Input
            id="location"
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            placeholder="Manchester"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input
            id="website"
            value={form.website}
            onChange={(e) => update("website", e.target.value)}
            placeholder="https://"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="booking_url">Booking URL</Label>
          <Input
            id="booking_url"
            value={form.booking_url}
            onChange={(e) => update("booking_url", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => update("phone", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
          />
        </div>
      </div>

      <input type="hidden" name="slug" value={form.slug} />

      <Button type="submit" disabled={pending} className="rounded-xl">
        {pending ? "Creating…" : "Create your business"}
      </Button>
    </form>
  );
}
