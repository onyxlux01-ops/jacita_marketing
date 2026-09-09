"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarPlus,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
  Wand2,
} from "lucide-react";
import { toast } from "sonner";
import { saveContentPackage } from "@/app/(app)/app/actions/content-studio";
import { SocialPreview } from "@/components/content/social-preview";
import { PlatformPill } from "@/components/content/platform-icons";
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
import type { SocialPlatform } from "@/lib/types";
import { MARKETING_GOALS, mapLegacyObjective } from "@/lib/ai/goals";
import { ACTION_LABELS, type RewriteAction } from "@/lib/ai/rewrite";
import { cn } from "@/lib/utils";

const AI = "__ai__";

type PlatformVersion = {
  platform: SocialPlatform;
  hook: string;
  caption: string;
  call_to_action: string;
  hashtags: string[];
  video_concept?: string | null;
  on_screen_text?: string | null;
  voiceover_script?: string | null;
  alt_text?: string | null;
  posting_recommendation?: string | null;
  platform_notes?: string | null;
};

type ContentPackage = {
  core_idea: string;
  title: string;
  marketing_objective: string;
  content_type: string;
  tone: string;
  platforms: SocialPlatform[];
  selected_service_name?: string | null;
  recommended_media_ids: string[];
  media_needed_message?: string | null;
  media_suitability_notes?: string[];
  versions: PlatformVersion[];
  suggested_posting_time: string;
};

type ValidationResult = {
  passed: boolean;
  score: number;
  issues: string[];
  flags: string[];
  summary: string;
  should_regenerate?: boolean;
  factuality_ok?: boolean;
};

type Variation = {
  label: string;
  tone: string;
  hook: string;
  caption: string;
  call_to_action: string;
  hashtags: string[];
  rationale?: string;
};

const CONTENT_TYPE_OPTIONS = [
  { value: AI, label: "Let AI decide" },
  { value: "image_post", label: "Image post" },
  { value: "carousel", label: "Carousel" },
  { value: "reel", label: "Reel" },
  { value: "short_video", label: "Short video" },
  { value: "educational", label: "Educational" },
  { value: "promotional", label: "Promotional" },
  { value: "testimonial", label: "Testimonial" },
  { value: "before_after", label: "Before & after" },
  { value: "behind_the_scenes", label: "Behind the scenes" },
  { value: "service_spotlight", label: "Service spotlight" },
  { value: "product_spotlight", label: "Product spotlight" },
  { value: "community", label: "Community" },
  { value: "seasonal", label: "Seasonal" },
];

const QUICK_REWRITE: RewriteAction[] = [
  "make_shorter",
  "make_more_engaging",
  "improve_hook",
  "improve_cta",
  "remove_ai_sounding",
  "adapt_tiktok",
  "adapt_instagram",
  "adapt_facebook",
];

export function GenerateContentForm({
  organisationId,
  organisationName,
  services,
  media,
  campaigns = [],
  series = [],
  initialNotes = "",
  initialGoal = "",
}: {
  organisationId: string;
  organisationName: string;
  services: Array<{ id: string; name: string }>;
  media: Array<{
    id: string;
    file_url: string | null;
    description: string | null;
    category?: string | null;
    media_type?: string | null;
  }>;
  campaigns?: Array<{ id: string; name: string }>;
  series?: Array<{ id: string; name: string }>;
  initialNotes?: string;
  initialGoal?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"nl" | "guided" | "batch">("nl");
  const [notes, setNotes] = useState(initialNotes);
  const [platform, setPlatform] = useState(AI);
  const [contentType, setContentType] = useState(AI);
  const [objective, setObjective] = useState(
    mapLegacyObjective(initialGoal || "increase_bookings")
  );
  const [tone, setTone] = useState(AI);
  const [serviceId, setServiceId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [seriesId, setSeriesId] = useState("");
  const [mediaId, setMediaId] = useState(AI);
  const [batchDays, setBatchDays] = useState("7");
  const [pkg, setPkg] = useState<ContentPackage | null>(null);
  const [activePlatform, setActivePlatform] = useState<SocialPlatform>("instagram");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [variations, setVariations] = useState<Variation[]>([]);
  const [editing, setEditing] = useState(false);
  const [gaps, setGaps] = useState<string[]>([]);

  const activeVersion = useMemo(() => {
    if (!pkg) return null;
    return (
      pkg.versions.find((v) => v.platform === activePlatform) || pkg.versions[0]
    );
  }, [pkg, activePlatform]);

  const selectedMedia = useMemo(
    () => media.find((m) => m.id === (mediaId === AI ? pkg?.recommended_media_ids?.[0] : mediaId)),
    [media, mediaId, pkg]
  );

  useEffect(() => {
    if (pkg?.versions?.[0]?.platform) {
      setActivePlatform(pkg.versions[0].platform);
    }
  }, [pkg]);

  function updateActiveVersion(patch: Partial<PlatformVersion>) {
    setPkg((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        versions: prev.versions.map((v) =>
          v.platform === activePlatform ? { ...v, ...patch } : v
        ),
      };
    });
  }

  function runStudioGenerate(extraNotes?: string) {
    if (!organisationId) {
      toast.error("Select or create a business first");
      return;
    }
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/studio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: organisationId,
            product_service_id: serviceId || null,
            campaign_id: campaignId || null,
            platform: platform === AI ? AI : platform,
            content_type: contentType === AI ? AI : contentType,
            marketing_objective: objective,
            tone: tone === AI ? AI : tone,
            media_asset_id: mediaId === AI ? null : mediaId || null,
            notes: extraNotes || notes,
            let_ai_decide_platform: platform === AI,
            let_ai_decide_content_type: contentType === AI,
            let_ai_decide_media: mediaId === AI,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Generation failed");
          return;
        }
        const next = data.package as ContentPackage;
        setPkg(next);
        setValidation((data.validation as ValidationResult) || null);
        setGaps(data.gaps || []);
        setVariations([]);
        if (data.selected_media_id) setMediaId(data.selected_media_id);
        else if (next.recommended_media_ids?.[0]) {
          setMediaId(next.recommended_media_ids[0]);
        }
        if (data.content_type) setContentType(data.content_type);
        if (data.tone) setTone(data.tone);
        if (data.service_id) setServiceId(data.service_id);
        toast.success(data.demo ? "Package ready (demo mode)" : "Content package ready");
      } catch {
        toast.error("Could not reach the Content Studio");
      }
    });
  }

  function runBatch() {
    const days = Number(batchDays) || 7;
    const batchNote = `${notes || "Create a content batch."}
Create a ${days}-day content mix for this business. Avoid repetitive promotional posts for the same service. Mix educational, promotional, social proof, behind the scenes, and community content.`;
    setMode("nl");
    // Use weekly-plan API then open library — or studio with batch note
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/weekly-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: organisationId,
            request_text: batchNote,
            goal_key: objective,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Batch planning failed");
          return;
        }
        const { applyWeeklyPlan } = await import("@/app/(app)/app/actions/ai");
        const applied = await applyWeeklyPlan({
          organisationId,
          goalKey: data.goal_key,
          plan: data.plan,
          strategy: data.strategy || null,
        });
        if ("error" in applied && applied.error) {
          toast.error(applied.error);
          return;
        }
        const count = "ids" in applied && applied.ids ? applied.ids.length : 0;
        toast.success(`Created ${count} draft posts — review in Content`);
        router.push("/app/content?status=draft");
      } catch {
        toast.error("Could not create content batch");
      }
    });
  }

  function runTransform(mode: "rewrite" | "variations" | "repurpose", action?: RewriteAction) {
    if (!pkg || !activeVersion) return;
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/studio/transform", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: organisationId,
            mode,
            action,
            platform: activePlatform,
            source_platform: activePlatform,
            target_platforms: ["instagram", "facebook", "tiktok"].filter(
              (p) => p !== activePlatform
            ),
            goal_label: pkg.marketing_objective,
            content: {
              title: pkg.title,
              hook: activeVersion.hook,
              caption: activeVersion.caption,
              call_to_action: activeVersion.call_to_action,
              hashtags: activeVersion.hashtags,
              video_concept: activeVersion.video_concept,
              on_screen_text: activeVersion.on_screen_text,
              voiceover_script: activeVersion.voiceover_script,
              alt_text: activeVersion.alt_text,
              content_type: pkg.content_type,
            },
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Transform failed");
          return;
        }
        if (mode === "rewrite") {
          updateActiveVersion(data.result);
          toast.success(data.result.change_summary || "Rewritten");
        } else if (mode === "variations") {
          setVariations(data.result.variations || []);
          toast.success("Variations ready — pick one");
        } else {
          const versions = data.result.versions as PlatformVersion[];
          setPkg((prev) => {
            if (!prev) return prev;
            const map = new Map(prev.versions.map((v) => [v.platform, v]));
            for (const v of versions) map.set(v.platform, v);
            return {
              ...prev,
              platforms: Array.from(map.keys()),
              versions: Array.from(map.values()),
            };
          });
          toast.success(data.result.summary || "Repurposed for other platforms");
        }
      } catch {
        toast.error("Could not transform content");
      }
    });
  }

  function onSave(nextStatus: "draft" | "review" | "approved" | "scheduled") {
    if (!pkg || !organisationId || !activeVersion) return;
    startTransition(async () => {
      const saved = await saveContentPackage({
        organisation_id: organisationId,
        campaign_id: campaignId || null,
        product_service_id: serviceId || null,
        series_id: seriesId || null,
        media_asset_id:
          mediaId && mediaId !== AI ? mediaId : pkg.recommended_media_ids[0] || null,
        title: pkg.title,
        idea: pkg.core_idea,
        hook: activeVersion.hook,
        caption: activeVersion.caption,
        call_to_action: activeVersion.call_to_action,
        hashtags: activeVersion.hashtags,
        suggested_posting_time: pkg.suggested_posting_time,
        video_concept: activeVersion.video_concept,
        on_screen_text: activeVersion.on_screen_text,
        voiceover_script: activeVersion.voiceover_script,
        alt_text: activeVersion.alt_text,
        posting_recommendation: activeVersion.posting_recommendation,
        content_type: pkg.content_type || contentType,
        marketing_objective: objective,
        tone: pkg.tone || tone,
        quality_score: validation?.score ?? null,
        quality_flags: validation?.flags || [],
        platforms: pkg.platforms,
        platform_versions: pkg.versions,
        status: nextStatus,
        scheduled_at:
          nextStatus === "scheduled" ? pkg.suggested_posting_time || null : null,
        generation_payload: {
          notes,
          package: pkg,
          validation,
          studio: true,
        },
      });
      if (saved.error) {
        toast.error(saved.error);
        return;
      }
      toast.success(
        nextStatus === "draft"
          ? "Saved as draft"
          : nextStatus === "review"
            ? "Sent for approval"
            : nextStatus === "scheduled"
              ? "Scheduled"
              : "Approved"
      );
      if (saved.id) router.push(`/app/content/${saved.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["nl", "Tell AI what you want"],
            ["guided", "Guided brief"],
            ["batch", "Content batch"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMode(id)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              mode === id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-start">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (mode === "batch") runBatch();
            else runStudioGenerate();
          }}
          className="jacita-panel space-y-5 rounded-xl p-5 sm:p-6"
        >
          <div>
            <p className="jacita-label">Content studio</p>
            <h2 className="mt-2 font-heading text-xl font-semibold">
              {mode === "batch" ? "Create a content batch" : "Create content"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {organisationName
                ? `For ${organisationName} — AI does the heavy lifting.`
                : "Select a business first."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nl">
              {mode === "batch"
                ? "What should this batch achieve?"
                : "What do you want to achieve?"}
            </Label>
            <Textarea
              id="nl"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder='e.g. "I want more customers for my braiding service."'
              rows={mode === "nl" ? 4 : 3}
            />
          </div>

          {mode === "batch" ? (
            <div className="space-y-2">
              <Label>Days</Label>
              <Select value={batchDays} onValueChange={(v) => setBatchDays(v ?? "7")}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {(mode === "guided" || mode === "batch") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Goal</Label>
                <Select
                  value={objective}
                  onValueChange={(v) =>
                    setObjective(mapLegacyObjective(v ?? "increase_bookings"))
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MARKETING_GOALS.map((g) => (
                      <SelectItem key={g.key} value={g.key}>
                        {g.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Service / product</Label>
                <Select
                  value={serviceId || "none"}
                  onValueChange={(v) => setServiceId(v === "none" ? "" : (v ?? ""))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Let AI decide" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Let AI decide</SelectItem>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {mode === "guided" ? (
                <>
                  <div className="space-y-2">
                    <Label>Platform</Label>
                    <Select value={platform} onValueChange={(v) => setPlatform(v ?? AI)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AI}>Let AI decide</SelectItem>
                        <SelectItem value="instagram">Instagram</SelectItem>
                        <SelectItem value="facebook">Facebook</SelectItem>
                        <SelectItem value="tiktok">TikTok</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Content type</Label>
                    <Select
                      value={contentType}
                      onValueChange={(v) => setContentType(v ?? AI)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CONTENT_TYPE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Tone</Label>
                    <Select value={tone} onValueChange={(v) => setTone(v ?? AI)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AI}>Let AI decide</SelectItem>
                        <SelectItem value="professional">Professional</SelectItem>
                        <SelectItem value="friendly">Friendly</SelectItem>
                        <SelectItem value="playful">Playful</SelectItem>
                        <SelectItem value="luxury">Luxury</SelectItem>
                        <SelectItem value="bold">Bold</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Media</Label>
                    <Select value={mediaId} onValueChange={(v) => setMediaId(v ?? AI)}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AI}>Let AI choose</SelectItem>
                        <SelectItem value="none">None</SelectItem>
                        {media.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.description || m.category || m.id.slice(0, 8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Campaign</Label>
                    <Select
                      value={campaignId || "none"}
                      onValueChange={(v) =>
                        setCampaignId(v === "none" ? "" : (v ?? ""))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {campaigns.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Series</Label>
                    <Select
                      value={seriesId || "none"}
                      onValueChange={(v) =>
                        setSeriesId(v === "none" ? "" : (v ?? ""))
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {series.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              type="submit"
              disabled={pending || !organisationId}
              className="rounded-xl"
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {mode === "batch" ? "Create batch" : "Generate"}
            </Button>
            {mode !== "batch" ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                disabled={pending || !organisationId}
                onClick={() => runStudioGenerate()}
              >
                <RefreshCw className="size-4" />
                Regenerate
              </Button>
            ) : null}
          </div>

          {gaps.length ? (
            <p className="text-xs text-muted-foreground">
              Stronger results if you add: {gaps.join(", ")}
            </p>
          ) : null}
        </form>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="jacita-label">Live preview</p>
              <h2 className="mt-1 font-heading text-xl font-semibold">
                Platform canvas
              </h2>
            </div>
            {pkg ? (
              <div className="flex flex-wrap justify-end gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditing((v) => !v)}
                >
                  {editing ? "Done" : "Edit"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => onSave("review")}
                >
                  <Check className="size-3.5" />
                  Approve
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending}
                  onClick={() => onSave("scheduled")}
                >
                  <CalendarPlus className="size-3.5" />
                  Schedule
                </Button>
              </div>
            ) : null}
          </div>

          {pkg?.versions?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {pkg.versions.map((v) => (
                <button
                  key={v.platform}
                  type="button"
                  onClick={() => setActivePlatform(v.platform)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium capitalize",
                    activePlatform === v.platform
                      ? "bg-primary/15 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {v.platform}
                </button>
              ))}
            </div>
          ) : null}

          <div className="rounded-xl bg-[linear-gradient(180deg,#eceff3_0%,#f7f8fa_100%)] px-4 py-8 sm:px-8">
            <SocialPreview
              platform={activePlatform}
              businessName={organisationName}
              caption={activeVersion?.caption}
              hook={activeVersion?.hook}
              hashtags={activeVersion?.hashtags}
              mediaUrl={selectedMedia?.file_url}
              onScreenText={activeVersion?.on_screen_text}
              editing={editing}
              onCaptionChange={(caption) => updateActiveVersion({ caption })}
            />
          </div>

          {pkg && activeVersion ? (
            <div className="jacita-panel space-y-4 rounded-xl p-5 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-heading text-base font-semibold">
                    {pkg.title}
                  </p>
                  <p className="mt-1 text-muted-foreground">{pkg.core_idea}</p>
                </div>
                <PlatformPill platform={activePlatform} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">Hook</span>
                  <Input
                    value={activeVersion.hook}
                    onChange={(e) => updateActiveVersion({ hook: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-xs text-muted-foreground">CTA</span>
                  <Input
                    value={activeVersion.call_to_action}
                    onChange={(e) =>
                      updateActiveVersion({ call_to_action: e.target.value })
                    }
                  />
                </label>
              </div>

              {activeVersion.video_concept ? (
                <p>
                  <span className="text-muted-foreground">Video · </span>
                  {activeVersion.video_concept}
                </p>
              ) : null}
              {activeVersion.voiceover_script ? (
                <p>
                  <span className="text-muted-foreground">Voiceover · </span>
                  {activeVersion.voiceover_script}
                </p>
              ) : null}
              {activeVersion.posting_recommendation ? (
                <p>
                  <span className="text-muted-foreground">Posting · </span>
                  {activeVersion.posting_recommendation}
                </p>
              ) : null}

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Media</p>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm">
                    {selectedMedia
                      ? selectedMedia.description || "Selected asset"
                      : "No media selected"}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const id = pkg.recommended_media_ids[0];
                      if (id) setMediaId(id);
                    }}
                  >
                    Use this
                  </Button>
                  <Select
                    value={mediaId === AI ? "none" : mediaId || "none"}
                    onValueChange={(v) => setMediaId(v === "none" ? "" : (v ?? ""))}
                  >
                    <SelectTrigger className="h-8 w-[160px]">
                      <SelectValue placeholder="Replace" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Remove</SelectItem>
                      {media.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.description || m.id.slice(0, 8)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {pkg.media_needed_message || pkg.media_suitability_notes?.length ? (
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    {pkg.media_needed_message ||
                      pkg.media_suitability_notes?.join(" ")}
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  AI rewrite
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_REWRITE.map((action) => (
                    <button
                      key={action}
                      type="button"
                      disabled={pending}
                      onClick={() => runTransform("rewrite", action)}
                      className="rounded-lg border border-border/70 px-2 py-1 text-[11px] hover:bg-muted"
                    >
                      {ACTION_LABELS[action]}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => runTransform("variations")}
                  >
                    <Wand2 className="size-3.5" />
                    3 variations
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => runTransform("repurpose")}
                  >
                    Repurpose to other platforms
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => onSave("draft")}
                  >
                    Save draft
                  </Button>
                </div>
              </div>

              {variations.length ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Choose a variation
                  </p>
                  {variations.map((v) => (
                    <button
                      key={v.label}
                      type="button"
                      className="block w-full rounded-lg border border-border/70 px-3 py-2 text-left hover:bg-muted/50"
                      onClick={() => {
                        updateActiveVersion({
                          hook: v.hook,
                          caption: v.caption,
                          call_to_action: v.call_to_action,
                          hashtags: v.hashtags,
                        });
                        setTone(v.tone);
                        setVariations([]);
                        toast.success(`Applied ${v.label}`);
                      }}
                    >
                      <span className="font-medium">{v.label}</span>
                      <span className="mt-1 block text-xs text-muted-foreground line-clamp-2">
                        {v.hook}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {validation ? (
                <div
                  className={cn(
                    "rounded-lg px-3 py-2 text-xs",
                    validation.passed
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  <p className="font-medium">
                    Quality check · {validation.score}/100 ·{" "}
                    {validation.passed ? "ready for review" : "needs review"}
                  </p>
                  <p className="mt-1">{validation.summary}</p>
                  {validation.issues.length ? (
                    <ul className="mt-1 list-disc pl-4">
                      {validation.issues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-center text-sm text-muted-foreground">
              Tell Jacita what you want — then review the package here.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
