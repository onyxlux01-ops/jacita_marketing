"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  FLYER_FORMATS,
  FLYER_MEDIA_MODES,
  type FlyerFormatId,
  type FlyerMediaMode,
} from "@/lib/ai/flyer-shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type ServiceOption = { id: string; name: string };

export function AiFlyerForm({
  organisationId,
  services = [],
}: {
  organisationId: string;
  services?: ServiceOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [format, setFormat] = useState<FlyerFormatId>("square");
  const [mediaMode, setMediaMode] = useState<FlyerMediaMode>("auto");
  const [serviceId, setServiceId] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [usedLibrary, setUsedLibrary] = useState(false);

  function onGenerate() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/ai/flyer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organisation_id: organisationId,
            notes: notes.trim() || null,
            format,
            media_mode: mediaMode,
            product_service_id: serviceId || null,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(data.error || "Flyer generation failed");
          if (data.brief?.headline) setHeadline(data.brief.headline);
          return;
        }

        const used = Array.isArray(data.used_library_media)
          ? data.used_library_media.length > 0
          : false;
        setUsedLibrary(used);
        setPreviewUrl(data.media?.file_url || null);
        setHeadline(data.brief?.headline || data.media?.description || null);
        toast.success(
          used
            ? "Flyer saved — designed with your uploaded photos"
            : "Flyer saved to your media library"
        );
        router.refresh();
      } catch {
        toast.error("Could not reach flyer generation");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">AI flyer</p>
          <p className="mt-1 text-sm text-muted-foreground">
            OpenAI designs a promotional graphic from your brand. In Auto mode it
            sometimes features photos from your media library.
          </p>
        </div>
        <Button type="button" disabled={pending} onClick={onGenerate}>
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Sparkles className="size-4" />
          )}
          {pending ? "Designing…" : "Generate flyer"}
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="flyer-format">Format</Label>
          <select
            id="flyer-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as FlyerFormatId)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {FLYER_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} · {f.hint}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="flyer-media-mode">Photos</Label>
          <select
            id="flyer-media-mode"
            value={mediaMode}
            onChange={(e) => setMediaMode(e.target.value as FlyerMediaMode)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            {FLYER_MEDIA_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label} · {m.hint}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="flyer-service">Service (optional)</Label>
          <select
            id="flyer-service"
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          >
            <option value="">Let AI choose</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="flyer-notes">Brief</Label>
          <Textarea
            id="flyer-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Spring sale 20% off colour treatments — use our salon photos"
            className="min-h-20"
          />
        </div>
      </div>

      {previewUrl ? (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={headline || "Generated flyer"}
            className="mx-auto max-h-80 w-full object-contain"
          />
          {headline || usedLibrary ? (
            <p className="border-t border-border/50 px-3 py-2 text-sm text-muted-foreground">
              {headline}
              {usedLibrary ? (
                <span className="mt-0.5 block text-xs">
                  Used your uploaded media as a design reference
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
