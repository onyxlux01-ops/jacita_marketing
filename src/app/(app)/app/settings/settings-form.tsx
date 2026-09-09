"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { updateOrganisationSettings } from "@/app/(app)/app/actions/org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Org = {
  id: string;
  name: string;
  business_category: string | null;
  description: string | null;
  location: string | null;
  website: string | null;
  booking_url: string | null;
  phone: string | null;
  email: string | null;
  opening_hours_text: string;
  logo_url: string | null;
};

type Brand = {
  brand_voice: string | null;
  tone: string | null;
  target_audience: string | null;
  business_description: string | null;
  marketing_objectives: string | null;
  preferred_terminology: string | null;
  words_to_avoid: string | null;
  custom_instructions: string | null;
  primary_color: string | null;
  secondary_color: string | null;
};

export function SettingsForm({
  organisation,
  brand,
  section = "all",
}: {
  organisation: Org;
  brand: Brand;
  section?: "business" | "brand" | "all";
}) {
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set("organisation_id", organisation.id);

    startTransition(async () => {
      const res = await updateOrganisationSettings(formData);
      if (res.error) toast.error(res.error);
      else toast.success("Settings saved");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <input type="hidden" name="settings_section" value={section} />
      {section === "brand" ? (
        <>
          <input type="hidden" name="name" value={organisation.name} />
          <input
            type="hidden"
            name="business_category"
            value={organisation.business_category ?? ""}
          />
          <input
            type="hidden"
            name="location"
            value={organisation.location ?? ""}
          />
          <input
            type="hidden"
            name="description"
            value={organisation.description ?? ""}
          />
          <input type="hidden" name="website" value={organisation.website ?? ""} />
          <input
            type="hidden"
            name="booking_url"
            value={organisation.booking_url ?? ""}
          />
          <input type="hidden" name="phone" value={organisation.phone ?? ""} />
          <input type="hidden" name="email" value={organisation.email ?? ""} />
          <input
            type="hidden"
            name="opening_hours"
            value={organisation.opening_hours_text}
          />
        </>
      ) : null}
      {section === "business" ? (
        <>
          <input
            type="hidden"
            name="brand_voice"
            value={brand.brand_voice ?? ""}
          />
          <input type="hidden" name="tone" value={brand.tone ?? ""} />
          <input
            type="hidden"
            name="target_audience"
            value={brand.target_audience ?? ""}
          />
          <input
            type="hidden"
            name="business_description"
            value={brand.business_description ?? ""}
          />
          <input
            type="hidden"
            name="marketing_objectives"
            value={brand.marketing_objectives ?? ""}
          />
          <input
            type="hidden"
            name="preferred_terminology"
            value={brand.preferred_terminology ?? ""}
          />
          <input
            type="hidden"
            name="words_to_avoid"
            value={brand.words_to_avoid ?? ""}
          />
          <input
            type="hidden"
            name="custom_instructions"
            value={brand.custom_instructions ?? ""}
          />
          <input
            type="hidden"
            name="primary_color"
            value={brand.primary_color ?? ""}
          />
          <input
            type="hidden"
            name="secondary_color"
            value={brand.secondary_color ?? ""}
          />
        </>
      ) : null}
      {section === "business" || section === "all" ? (
      <section className="jacita-panel rounded-2xl p-5 sm:p-6">
        <p className="jacita-label">Profile</p>
        <h2 className="mt-2 font-heading text-lg font-semibold">
          Business profile
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Public-facing business details
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" defaultValue={organisation.name} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_category">Category</Label>
            <Input
              id="business_category"
              name="business_category"
              defaultValue={organisation.business_category ?? ""}
              placeholder="Barber, Restaurant, Fitness…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              name="location"
              defaultValue={organisation.location ?? ""}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              rows={3}
              defaultValue={organisation.description ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              name="website"
              defaultValue={organisation.website ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="booking_url">Booking URL</Label>
            <Input
              id="booking_url"
              name="booking_url"
              defaultValue={organisation.booking_url ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" name="phone" defaultValue={organisation.phone ?? ""} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" defaultValue={organisation.email ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="opening_hours">Opening hours</Label>
            <Textarea
              id="opening_hours"
              name="opening_hours"
              rows={3}
              placeholder={'Mon–Fri 9–6, Sat 9–4\nor JSON e.g. {"mon":"9-18"}'}
              defaultValue={organisation.opening_hours_text}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="logo">Logo</Label>
            <Input id="logo" name="logo" type="file" accept="image/*" />
            {organisation.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={organisation.logo_url}
                alt="Current logo"
                className="mt-2 size-16 rounded-lg object-cover"
              />
            ) : null}
          </div>
        </div>
      </section>
      ) : null}

      {section === "brand" || section === "all" ? (
      <section className="jacita-panel rounded-2xl p-5 sm:p-6">
        <p className="jacita-label">Voice</p>
        <h2 className="mt-2 font-heading text-lg font-semibold">
          Brand profile
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Voice and terminology for AI generation
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="brand_voice">Brand voice</Label>
            <Input
              id="brand_voice"
              name="brand_voice"
              defaultValue={brand.brand_voice ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tone</Label>
            <Input id="tone" name="tone" defaultValue={brand.tone ?? ""} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="target_audience">Target audience</Label>
            <Textarea
              id="target_audience"
              name="target_audience"
              rows={2}
              defaultValue={brand.target_audience ?? ""}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="business_description">Brand description</Label>
            <Textarea
              id="business_description"
              name="business_description"
              rows={2}
              defaultValue={brand.business_description ?? ""}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="marketing_objectives">Marketing objectives</Label>
            <Textarea
              id="marketing_objectives"
              name="marketing_objectives"
              rows={2}
              defaultValue={brand.marketing_objectives ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="preferred_terminology">Preferred terminology</Label>
            <Input
              id="preferred_terminology"
              name="preferred_terminology"
              defaultValue={brand.preferred_terminology ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="words_to_avoid">Words to avoid</Label>
            <Input
              id="words_to_avoid"
              name="words_to_avoid"
              defaultValue={brand.words_to_avoid ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="primary_color">Primary color</Label>
            <Input
              id="primary_color"
              name="primary_color"
              defaultValue={brand.primary_color ?? ""}
              placeholder="#0a6b63"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="secondary_color">Secondary color</Label>
            <Input
              id="secondary_color"
              name="secondary_color"
              defaultValue={brand.secondary_color ?? ""}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="custom_instructions">Custom instructions</Label>
            <Textarea
              id="custom_instructions"
              name="custom_instructions"
              rows={2}
              placeholder="Our brand should feel premium, friendly and confident."
              defaultValue={brand.custom_instructions ?? ""}
            />
          </div>
        </div>
      </section>
      ) : null}

      <Button type="submit" disabled={pending} className="rounded-xl">
        Save settings
      </Button>
    </form>
  );
}
