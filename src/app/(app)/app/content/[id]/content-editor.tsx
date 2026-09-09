"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateContentFields } from "@/app/(app)/app/actions/content-studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Fields = {
  title: string;
  hook: string;
  caption: string;
  call_to_action: string;
  hashtags: string;
  video_concept: string;
  on_screen_text: string;
  voiceover_script: string;
  alt_text: string;
  posting_recommendation: string;
  scheduled_at: string;
};

export function ContentEditor({
  contentId,
  organisationId,
  initial,
}: {
  contentId: string;
  organisationId: string;
  initial: {
    title: string | null;
    hook: string | null;
    caption: string | null;
    call_to_action: string | null;
    hashtags: string[] | null;
    video_concept: string | null;
    on_screen_text: string | null;
    voiceover_script: string | null;
    alt_text: string | null;
    posting_recommendation: string | null;
    scheduled_at: string | null;
  };
}) {
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [fields, setFields] = useState<Fields>({
    title: initial.title || "",
    hook: initial.hook || "",
    caption: initial.caption || "",
    call_to_action: initial.call_to_action || "",
    hashtags: (initial.hashtags || []).join(", "),
    video_concept: initial.video_concept || "",
    on_screen_text: initial.on_screen_text || "",
    voiceover_script: initial.voiceover_script || "",
    alt_text: initial.alt_text || "",
    posting_recommendation: initial.posting_recommendation || "",
    scheduled_at: initial.scheduled_at
      ? new Date(initial.scheduled_at).toISOString().slice(0, 16)
      : "",
  });

  function patch<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const res = await updateContentFields({
          contentId,
          organisationId,
          silent: true,
          fields: {
            title: fields.title || null,
            hook: fields.hook || null,
            caption: fields.caption || null,
            call_to_action: fields.call_to_action || null,
            hashtags: fields.hashtags
              .split(/[#,]+/)
              .map((t) => t.trim())
              .filter(Boolean),
            video_concept: fields.video_concept || null,
            on_screen_text: fields.on_screen_text || null,
            voiceover_script: fields.voiceover_script || null,
            alt_text: fields.alt_text || null,
            posting_recommendation: fields.posting_recommendation || null,
            scheduled_at: fields.scheduled_at
              ? new Date(fields.scheduled_at).toISOString()
              : null,
          },
        });
        if (res.error) toast.error(res.error);
        else setDirty(false);
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [fields, dirty, contentId, organisationId]);

  function saveExplicit() {
    startTransition(async () => {
      const res = await updateContentFields({
        contentId,
        organisationId,
        fields: {
          title: fields.title || null,
          hook: fields.hook || null,
          caption: fields.caption || null,
          call_to_action: fields.call_to_action || null,
          hashtags: fields.hashtags
            .split(/[#,]+/)
            .map((t) => t.trim())
            .filter(Boolean),
          video_concept: fields.video_concept || null,
          on_screen_text: fields.on_screen_text || null,
          voiceover_script: fields.voiceover_script || null,
          alt_text: fields.alt_text || null,
          posting_recommendation: fields.posting_recommendation || null,
          scheduled_at: fields.scheduled_at
            ? new Date(fields.scheduled_at).toISOString()
            : null,
        },
      });
      if (res.error) toast.error(res.error);
      else {
        setDirty(false);
        toast.success("Saved");
      }
    });
  }

  function discard() {
    setFields({
      title: initial.title || "",
      hook: initial.hook || "",
      caption: initial.caption || "",
      call_to_action: initial.call_to_action || "",
      hashtags: (initial.hashtags || []).join(", "),
      video_concept: initial.video_concept || "",
      on_screen_text: initial.on_screen_text || "",
      voiceover_script: initial.voiceover_script || "",
      alt_text: initial.alt_text || "",
      posting_recommendation: initial.posting_recommendation || "",
      scheduled_at: initial.scheduled_at
        ? new Date(initial.scheduled_at).toISOString().slice(0, 16)
        : "",
    });
    setDirty(false);
  }

  return (
    <section className="jacita-panel space-y-4 rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="jacita-label">Editor</p>
          <h2 className="mt-1 font-heading text-lg font-semibold">
            Edit content
          </h2>
          <p className="text-xs text-muted-foreground">
            {dirty ? "Unsaved changes · autosaving…" : "All changes saved"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !dirty}
            onClick={discard}
          >
            Discard
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={saveExplicit}
          >
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label>Title</Label>
          <Input value={fields.title} onChange={(e) => patch("title", e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Hook</Label>
          <Input value={fields.hook} onChange={(e) => patch("hook", e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Caption</Label>
          <Textarea
            rows={5}
            value={fields.caption}
            onChange={(e) => patch("caption", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>CTA</Label>
          <Input
            value={fields.call_to_action}
            onChange={(e) => patch("call_to_action", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Hashtags</Label>
          <Input
            value={fields.hashtags}
            onChange={(e) => patch("hashtags", e.target.value)}
            placeholder="comma separated"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>On-screen text</Label>
          <Input
            value={fields.on_screen_text}
            onChange={(e) => patch("on_screen_text", e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Video / reel concept</Label>
          <Textarea
            rows={2}
            value={fields.video_concept}
            onChange={(e) => patch("video_concept", e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Voiceover script</Label>
          <Textarea
            rows={2}
            value={fields.voiceover_script}
            onChange={(e) => patch("voiceover_script", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Alt text</Label>
          <Input
            value={fields.alt_text}
            onChange={(e) => patch("alt_text", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Schedule</Label>
          <Input
            type="datetime-local"
            value={fields.scheduled_at}
            onChange={(e) => patch("scheduled_at", e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>Posting recommendation</Label>
          <Input
            value={fields.posting_recommendation}
            onChange={(e) => patch("posting_recommendation", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
