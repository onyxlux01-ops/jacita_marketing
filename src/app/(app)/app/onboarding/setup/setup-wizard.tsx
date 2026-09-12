"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  advanceToStep,
  completeOnboarding,
  saveOnboardingAudience,
  saveOnboardingBrand,
  saveOnboardingGoals,
  skipOnboardingStep,
} from "@/app/(app)/app/actions/onboarding";
import { createService, registerUploadedMediaAssets } from "@/app/(app)/app/actions/org";
import { MARKETING_GOALS } from "@/lib/ai/goals";
import {
  MEDIA_ACCEPT,
  uploadFilesToMediaBucket,
} from "@/lib/media/upload-media-client";
import {
  BRAND_VOICE_OPTIONS,
  MEDIA_CATEGORIES,
  type OnboardingStep,
} from "@/lib/org/setup-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlatformPill } from "@/components/content/platform-icons";
import type { SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

type Brand = {
  brand_voice: string | null;
  tone: string | null;
  target_audience: string | null;
  business_description: string | null;
  preferred_terminology: string | null;
  words_to_avoid: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  custom_instructions: string | null;
  logo_path: string | null;
} | null;

type Audience = {
  age_range: string | null;
  location_focus: string | null;
  interests: string[] | null;
  customer_types: string[] | null;
  income_lifestyle: string | null;
  ideal_customer_description: string | null;
  additional_notes: string | null;
} | null;

type Service = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  price: number | null;
};

type Social = {
  platform: string;
  connection_status: string;
  account_name: string | null;
  account_handle: string | null;
};

const NEXT: Partial<Record<OnboardingStep, OnboardingStep>> = {
  business: "brand",
  brand: "services",
  services: "audience",
  audience: "goals",
  goals: "media",
  media: "social",
  social: "complete",
};

export function SetupWizard({
  organisationId,
  organisationName,
  step,
  brand,
  audience,
  services,
  goalKeys,
  primaryGoal,
  social,
  mediaCount,
}: {
  organisationId: string;
  organisationName: string;
  step: OnboardingStep;
  brand: Brand;
  audience: Audience;
  services: Service[];
  goalKeys: string[];
  primaryGoal: string | null;
  social: Social[];
  mediaCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedGoals, setSelectedGoals] = useState<string[]>(
    goalKeys.length ? goalKeys : primaryGoal ? [primaryGoal] : []
  );
  const [primary, setPrimary] = useState(primaryGoal || "");
  const [voice, setVoice] = useState(brand?.brand_voice || "");

  function go(next: OnboardingStep) {
    router.push(`/app/onboarding/setup?step=${next}`);
    router.refresh();
  }

  function skip() {
    const next = NEXT[step];
    if (!next) return;
    startTransition(async () => {
      const res = await skipOnboardingStep({
        organisationId,
        step,
        next,
      });
      if (res.error) toast.error(res.error);
      else if (next === "complete") {
        await completeOnboarding(organisationId);
      } else go(next);
    });
  }

  if (step === "business") {
    return (
      <Section
        title="Business profile"
        description="You already created this business. Edit details anytime in settings."
      >
        <p className="text-sm">
          <span className="font-medium">{organisationName}</span> is ready.
          Continue with brand setup.
        </p>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button asChild>
            <Link href="/app/settings?section=business">Edit in settings</Link>
          </Button>
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await advanceToStep(organisationId, "brand");
                go("brand");
              });
            }}
          >
            Continue to brand
          </Button>
        </div>
      </Section>
    );
  }

  if (step === "brand") {
    return (
      <Section
        title="Brand"
        description="Help your assistant sound like your business."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            formData.set("organisation_id", organisationId);
            formData.set("brand_voice", voice);
            startTransition(async () => {
              const res = await saveOnboardingBrand(formData);
              if (res.error) toast.error(res.error);
              else go("services");
            });
          }}
        >
          <div className="space-y-2">
            <Label>Brand voice</Label>
            <div className="flex flex-wrap gap-2">
              {BRAND_VOICE_OPTIONS.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => setVoice(opt)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs",
                    voice === opt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {opt}
                </button>
              ))}
            </div>
            <input type="hidden" name="brand_voice" value={voice} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tone">Tone</Label>
            <Input
              id="tone"
              name="tone"
              defaultValue={brand?.tone ?? ""}
              placeholder="Confident, welcoming…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="business_description">Brand description</Label>
            <Textarea
              id="business_description"
              name="business_description"
              rows={3}
              defaultValue={brand?.business_description ?? ""}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="custom_instructions">Custom instructions</Label>
            <Textarea
              id="custom_instructions"
              name="custom_instructions"
              rows={2}
              defaultValue={brand?.custom_instructions ?? ""}
              placeholder="Our brand should feel premium, friendly and confident."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="primary_color">Primary colour</Label>
              <Input
                id="primary_color"
                name="primary_color"
                defaultValue={brand?.primary_color ?? ""}
                placeholder="#0a6b63"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="secondary_color">Secondary colour</Label>
              <Input
                id="secondary_color"
                name="secondary_color"
                defaultValue={brand?.secondary_color ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="preferred_terminology">Words to use</Label>
              <Input
                id="preferred_terminology"
                name="preferred_terminology"
                defaultValue={brand?.preferred_terminology ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="words_to_avoid">Words to avoid</Label>
              <Input
                id="words_to_avoid"
                name="words_to_avoid"
                defaultValue={brand?.words_to_avoid ?? ""}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="logo">Logo</Label>
            <Input id="logo" name="logo" type="file" accept="image/*" />
          </div>
          <Actions pending={pending} onSkip={skip} submitLabel="Save & continue" />
        </form>
      </Section>
    );
  }

  if (step === "services") {
    return (
      <Section
        title="Services / products"
        description="Add what you sell so content can promote the right offers."
      >
        <ul className="space-y-2 text-sm">
          {services.map((s) => (
            <li key={s.id} className="rounded-lg bg-muted/50 px-3 py-2">
              {s.name}
              {s.price != null ? ` · £${s.price}` : ""}
            </li>
          ))}
          {!services.length ? (
            <li className="text-muted-foreground">No services yet.</li>
          ) : null}
        </ul>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const formData = new FormData(form);
            formData.set("organisation_id", organisationId);
            startTransition(async () => {
              const res = await createService(formData);
              if (res.error) toast.error(res.error);
              else {
                toast.success("Service added");
                form.reset();
                router.refresh();
              }
            });
          }}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="svc_name">Name</Label>
            <Input id="svc_name" name="name" required placeholder="Knotless Braids" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="svc_desc">Description</Label>
            <Textarea id="svc_desc" name="description" rows={2} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc_cat">Category</Label>
            <Input id="svc_cat" name="category" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc_price">Price</Label>
            <Input id="svc_price" name="price" type="number" step="0.01" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="svc_duration">Duration (minutes)</Label>
            <Input id="svc_duration" name="duration_minutes" type="number" />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} variant="outline">
              Add item
            </Button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await advanceToStep(organisationId, "audience");
                go("audience");
              });
            }}
          >
            Continue
          </Button>
          <Button variant="ghost" disabled={pending} onClick={skip}>
            Skip for now
          </Button>
        </div>
      </Section>
    );
  }

  if (step === "audience") {
    return (
      <Section
        title="Audience"
        description="Who are you trying to reach? Not every field is required."
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            formData.set("organisation_id", organisationId);
            startTransition(async () => {
              const res = await saveOnboardingAudience(formData);
              if (res.error) toast.error(res.error);
              else go("goals");
            });
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="ideal_customer_description">
              Describe your ideal customer
            </Label>
            <Textarea
              id="ideal_customer_description"
              name="ideal_customer_description"
              rows={3}
              defaultValue={audience?.ideal_customer_description ?? ""}
              placeholder="Local professionals who want premium hair care…"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="age_range">Age range</Label>
              <Input
                id="age_range"
                name="age_range"
                defaultValue={audience?.age_range ?? ""}
                placeholder="25–45"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location_focus">Location</Label>
              <Input
                id="location_focus"
                name="location_focus"
                defaultValue={audience?.location_focus ?? ""}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="interests">Interests (comma-separated)</Label>
              <Input
                id="interests"
                name="interests"
                defaultValue={(audience?.interests || []).join(", ")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer_types">Customer type</Label>
              <Input
                id="customer_types"
                name="customer_types"
                defaultValue={(audience?.customer_types || []).join(", ")}
                placeholder="New clients, returning…"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="income_lifestyle">Income / lifestyle</Label>
              <Input
                id="income_lifestyle"
                name="income_lifestyle"
                defaultValue={audience?.income_lifestyle ?? ""}
              />
            </div>
          </div>
          <Actions pending={pending} onSkip={skip} submitLabel="Save & continue" />
        </form>
      </Section>
    );
  }

  if (step === "goals") {
    return (
      <Section
        title="Marketing goals"
        description="What do you want your marketing to achieve? Choose one primary goal."
      >
        <div className="space-y-3">
          {MARKETING_GOALS.map((g) => {
            const checked = selectedGoals.includes(g.key);
            const isPrimary = primary === g.key;
            return (
              <label
                key={g.key}
                className={cn(
                  "flex cursor-pointer flex-wrap items-start justify-between gap-3 rounded-xl border px-4 py-3",
                  checked ? "border-primary/40 bg-primary/5" : "border-border/70"
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={checked}
                    onChange={(e) => {
                      setSelectedGoals((prev) => {
                        if (e.target.checked) return [...prev, g.key];
                        return prev.filter((k) => k !== g.key);
                      });
                      if (!e.target.checked && primary === g.key) setPrimary("");
                      if (e.target.checked && !primary) setPrimary(g.key);
                    }}
                  />
                  <div>
                    <p className="text-sm font-medium">{g.label}</p>
                    <p className="text-xs text-muted-foreground">{g.description}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className={cn(
                    "text-xs font-medium",
                    isPrimary ? "text-primary" : "text-muted-foreground"
                  )}
                  onClick={() => {
                    setPrimary(g.key);
                    setSelectedGoals((prev) =>
                      prev.includes(g.key) ? prev : [...prev, g.key]
                    );
                  }}
                >
                  {isPrimary ? "Primary" : "Make primary"}
                </button>
              </label>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                const formData = new FormData();
                formData.set("organisation_id", organisationId);
                formData.set("primary_goal", primary);
                selectedGoals.forEach((g) => formData.append("goals", g));
                const res = await saveOnboardingGoals(formData);
                if (res.error) toast.error(res.error);
                else go("media");
              });
            }}
          >
            Save & continue
          </Button>
          <Button variant="ghost" disabled={pending} onClick={skip}>
            Skip for now
          </Button>
        </div>
      </Section>
    );
  }

  if (step === "media") {
    return (
      <Section
        title="Media"
        description="Upload photos and videos your marketing assistant can use."
      >
        <p className="text-sm text-muted-foreground">
          {mediaCount} asset{mediaCount === 1 ? "" : "s"} uploaded for this
          business.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const files = Array.from(
              (form.elements.namedItem("file") as HTMLInputElement)?.files ??
                []
            ).filter((f) => f.size > 0);
            const category =
              (form.elements.namedItem("category") as HTMLSelectElement)
                ?.value || null;
            const description =
              (form.elements.namedItem("description") as HTMLInputElement)
                ?.value || null;

            if (!files.length) {
              toast.error("Choose at least one file");
              return;
            }

            startTransition(async () => {
              try {
                const { uploads, error: uploadError } =
                  await uploadFilesToMediaBucket(organisationId, files);
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

                toast.success(
                  res.count && res.count > 1
                    ? `Uploaded ${res.count}`
                    : "Uploaded"
                );
                form.reset();
                router.refresh();
              } catch (err) {
                toast.error(
                  err instanceof Error ? err.message : "Upload failed"
                );
              }
            });
          }}
        >
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="files">Files</Label>
            <Input
              id="files"
              name="file"
              type="file"
              accept={MEDIA_ACCEPT}
              multiple
              required
            />
            <p className="text-xs text-muted-foreground">
              JPEG, PNG, WebP, GIF, MP4, MOV, WebM · max 50 MB each. Assets stay
              under this business only.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <select
              id="category"
              name="category"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              defaultValue="Brand"
            >
              {MEDIA_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={pending} variant="outline">
              Upload
            </Button>
          </div>
        </form>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await advanceToStep(organisationId, "social");
                go("social");
              });
            }}
          >
            Continue
          </Button>
          <Button variant="ghost" disabled={pending} onClick={skip}>
            Skip for now
          </Button>
        </div>
      </Section>
    );
  }

  if (step === "social") {
    return (
      <Section
        title="Connect your social accounts"
        description="Optional — you can connect later. Connections are never faked."
      >
        <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
          {(["instagram", "facebook", "tiktok"] as SocialPlatform[]).map(
            (platform) => {
              const row = social.find((s) => s.platform === platform);
              const connected = row?.connection_status === "connected";
              return (
                <li
                  key={platform}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <PlatformPill platform={platform} />
                    <span className="text-sm text-muted-foreground">
                      {connected
                        ? row?.account_handle || row?.account_name || "Connected"
                        : "Not connected"}
                    </span>
                  </div>
                  {connected ? (
                    <span className="text-xs font-medium text-primary">
                      Connected
                    </span>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <a
                        href={`/api/social/oauth/${platform}/start?organisation_id=${encodeURIComponent(organisationId)}`}
                      >
                        Connect
                      </a>
                    </Button>
                  )}
                </li>
              );
            }
          )}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await completeOnboarding(organisationId);
              });
            }}
          >
            Finish setup
          </Button>
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                await completeOnboarding(organisationId);
              });
            }}
          >
            Skip & finish
          </Button>
        </div>
      </Section>
    );
  }

  return null;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="jacita-panel space-y-4 rounded-2xl p-5 sm:p-6">
      <div>
        <h2 className="font-heading text-lg font-semibold">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Actions({
  pending,
  onSkip,
  submitLabel,
}: {
  pending: boolean;
  onSkip: () => void;
  submitLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-2 pt-2">
      <Button type="submit" disabled={pending}>
        {submitLabel}
      </Button>
      <Button type="button" variant="ghost" disabled={pending} onClick={onSkip}>
        Skip for now
      </Button>
    </div>
  );
}
