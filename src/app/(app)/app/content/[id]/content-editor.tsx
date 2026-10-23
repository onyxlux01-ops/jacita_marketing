"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateContentFields } from "@/app/(app)/app/actions/content-studio";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatInTimeZone, normaliseTimeZone } from "@/lib/timezone";
import type { ContentStatus } from "@/lib/types";
import {
  changedFields,
  editorFieldsFrom,
  type EditorFields as Fields,
  type EditorSource as Initial,
} from "@/lib/content/editor-fields";

type SaveState = "idle" | "saving" | "saved" | "failed";

const APPROVED_STATES: ContentStatus[] = ["approved", "scheduled", "failed"];

const toFields = editorFieldsFrom;

/**
 * Copy editor with autosave.
 *
 * Every edit bumps a revision. Saves run one at a time (a promise chain), each
 * sending the snapshot of the revision it was queued for; the editor is
 * "saved" only once the LATEST revision has been saved, so an older save
 * finishing late can never mark newer edits as saved. A failed save keeps the
 * edits dirty and shows Failed with a retry.
 *
 * The schedule is not edited here: it is changed from the Workflow panel,
 * which reschedules the queued posts through the scheduler.
 */
export function ContentEditor({
  contentId,
  organisationId,
  initial,
  status,
  scheduledAt,
  timeZone,
  onPreviewChange,
}: {
  contentId: string;
  organisationId: string;
  initial: Initial;
  status: ContentStatus;
  scheduledAt: string | null;
  timeZone: string;
  onPreviewChange?: (fields: Fields, unsaved: boolean) => void;
}) {
  const router = useRouter();
  const tz = normaliseTimeZone(timeZone);
  const [fields, setFields] = useState<Fields>(() => toFields(initial));
  const [revision, setRevision] = useState(0);
  const [savedRevision, setSavedRevision] = useState(0);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Mutable mirrors for the save queue (read only in handlers/effects).
  const latest = useRef<{ fields: Fields; revision: number }>({
    fields: toFields(initial),
    revision: 0,
  });
  const saved = useRef<{ fields: Fields; revision: number }>({
    fields: toFields(initial),
    revision: 0,
  });
  const chain = useRef<Promise<void>>(Promise.resolve());
  const inFlight = useRef(0);

  const dirty = revision > savedRevision;
  const busy = saveState === "saving";

  function patch<K extends keyof Fields>(key: K, value: Fields[K]) {
    const next = { ...latest.current.fields, [key]: value };
    const rev = latest.current.revision + 1;
    latest.current = { fields: next, revision: rev };
    setFields(next);
    setRevision(rev);
    onPreviewChange?.(next, true);
  }

  function enqueueSave(explicit: boolean) {
    const { fields: snapshot, revision: rev } = latest.current;
    chain.current = chain.current.then(async () => {
      // A later save already covered this revision.
      if (rev <= saved.current.revision && !explicit) return;
      // Only what changed since the last successful save: untouched fields
      // are never rewritten (so they can't look like a material edit).
      const changes = changedFields(saved.current.fields, snapshot);
      if (!Object.keys(changes).length) {
        if (rev > saved.current.revision) {
          saved.current = { fields: snapshot, revision: rev };
          setSavedRevision(rev);
        }
        if (explicit) toast.success("Saved");
        if (inFlight.current === 0) setSaveState("saved");
        if (rev === latest.current.revision) onPreviewChange?.(snapshot, false);
        return;
      }
      inFlight.current += 1;
      setSaveState("saving");
      let outcome: SaveState = "saved";
      try {
        const res = await updateContentFields({
          contentId,
          organisationId,
          silent: !explicit,
          fields: changes,
        });
        if (!res.success) {
          outcome = "failed";
          setSaveError(res.error);
          if (explicit) toast.error(res.error);
          return;
        }
        if (rev > saved.current.revision) {
          saved.current = { fields: snapshot, revision: rev };
          setSavedRevision(rev);
        }
        setSaveError(null);
        if (rev === latest.current.revision) onPreviewChange?.(snapshot, false);
        if (res.movedToReview) {
          toast.warning(
            "This post was approved, so the edit sent it back to review. Its queued posts are on hold until it is approved again."
          );
          router.refresh();
        } else if (explicit) {
          toast.success("Saved");
        }
      } catch (e) {
        outcome = "failed";
        const message = e instanceof Error ? e.message : "Could not save";
        setSaveError(message);
        if (explicit) toast.error(message);
      } finally {
        inFlight.current -= 1;
        if (inFlight.current === 0) setSaveState(outcome);
      }
    });
    return chain.current;
  }

  const autosave = useEffectEvent(() => {
    void enqueueSave(false);
  });

  // Debounced autosave of the latest revision. Not re-armed after a failure
  // until the user edits again or retries (no silent retry loop).
  useEffect(() => {
    if (revision <= savedRevision || saveState === "failed") return;
    const timer = setTimeout(autosave, 900);
    return () => clearTimeout(timer);
  }, [revision, savedRevision, saveState]);

  // Warn before leaving with unsaved edits.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function saveNow() {
    if (saveState === "failed") setSaveState("idle");
    void enqueueSave(true);
  }

  function discard() {
    const rev = latest.current.revision + 1;
    latest.current = { fields: saved.current.fields, revision: rev };
    saved.current = { ...saved.current, revision: rev };
    setFields(saved.current.fields);
    setRevision(rev);
    setSavedRevision(rev);
    setSaveState("idle");
    setSaveError(null);
    onPreviewChange?.(saved.current.fields, false);
  }

  function onEdit<K extends keyof Fields>(key: K, value: Fields[K]) {
    if (saveState === "failed") setSaveState("idle");
    patch(key, value);
  }

  const statusText =
    saveState === "failed" && dirty
      ? `Save failed${saveError ? `: ${saveError}` : ""}`
      : busy
        ? "Saving…"
        : dirty
          ? "Unsaved changes · autosaving…"
          : saveState === "saved"
            ? "Saved"
            : "All changes saved";

  return (
    <section className="jacita-panel space-y-4 rounded-xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="jacita-label">Editor</p>
          <h2 className="mt-1 font-heading text-lg font-semibold">
            Edit content
          </h2>
          <p
            className={`text-xs ${
              saveState === "failed" && dirty ? "text-destructive" : "text-muted-foreground"
            }`}
            role="status"
            aria-live="polite"
          >
            {statusText}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11"
            disabled={busy || !dirty}
            onClick={discard}
          >
            Discard
          </Button>
          <Button type="button" size="sm" className="min-h-11" disabled={busy} onClick={saveNow}>
            {saveState === "failed" && dirty ? "Retry save" : "Save"}
          </Button>
        </div>
      </div>

      {APPROVED_STATES.includes(status) ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
          This post is {status}. Changing its title, hook, caption, CTA,
          hashtags or media sends it back to review and holds its queued posts
          until it is approved again.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`content-${contentId}-title`}>Title</Label>
          <Input id={`content-${contentId}-title`} value={fields.title} onChange={(e) => onEdit("title", e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`content-${contentId}-hook`}>Hook</Label>
          <Input id={`content-${contentId}-hook`} value={fields.hook} onChange={(e) => onEdit("hook", e.target.value)} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`content-${contentId}-caption`}>Caption</Label>
          <Textarea
            rows={5}
            id={`content-${contentId}-caption`} value={fields.caption}
            onChange={(e) => onEdit("caption", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`content-${contentId}-call_to_action`}>CTA</Label>
          <Input
            id={`content-${contentId}-call_to_action`} value={fields.call_to_action}
            onChange={(e) => onEdit("call_to_action", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`content-${contentId}-hashtags`}>Hashtags</Label>
          <Input
            id={`content-${contentId}-hashtags`} value={fields.hashtags}
            onChange={(e) => onEdit("hashtags", e.target.value)}
            placeholder="comma separated"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`content-${contentId}-on_screen_text`}>On-screen text</Label>
          <Input
            id={`content-${contentId}-on_screen_text`} value={fields.on_screen_text}
            onChange={(e) => onEdit("on_screen_text", e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`content-${contentId}-video_concept`}>Video / reel concept</Label>
          <Textarea
            rows={2}
            id={`content-${contentId}-video_concept`} value={fields.video_concept}
            onChange={(e) => onEdit("video_concept", e.target.value)}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`content-${contentId}-voiceover_script`}>Voiceover script</Label>
          <Textarea
            rows={2}
            id={`content-${contentId}-voiceover_script`} value={fields.voiceover_script}
            onChange={(e) => onEdit("voiceover_script", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`content-${contentId}-alt_text`}>Alt text</Label>
          <Input
            id={`content-${contentId}-alt_text`} value={fields.alt_text}
            onChange={(e) => onEdit("alt_text", e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Schedule</Label>
          <p className="rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
            {scheduledAt
              ? formatInTimeZone(scheduledAt, tz)
              : "Not scheduled"}
          </p>
          <p className="text-xs text-muted-foreground">
            Times are in {tz}. Change the time from the Workflow panel.
          </p>
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor={`content-${contentId}-posting_recommendation`}>Posting recommendation</Label>
          <Input
            id={`content-${contentId}-posting_recommendation`} value={fields.posting_recommendation}
            onChange={(e) => onEdit("posting_recommendation", e.target.value)}
          />
        </div>
      </div>
    </section>
  );
}
