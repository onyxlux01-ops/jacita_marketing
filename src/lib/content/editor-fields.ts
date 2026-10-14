/**
 * Content editor form model (pure; shared by the editor and its tests).
 *
 * The editor saves ONLY the fields that differ from the last saved snapshot.
 * Sending every field on every autosave would rewrite untouched columns, and
 * any normalisation difference (e.g. "#fyp" stored, "fyp" sent back) would
 * look like a material edit to the database and send approved content back
 * to review.
 */

export type EditorFields = {
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
};

export type EditorSource = {
  [K in Exclude<keyof EditorFields, "hashtags">]: string | null;
} & { hashtags: string[] | null };

export type EditorPayload = {
  [K in Exclude<keyof EditorFields, "hashtags">]?: string | null;
} & { hashtags?: string[] };

const TEXT_KEYS = [
  "title",
  "hook",
  "caption",
  "call_to_action",
  "video_concept",
  "on_screen_text",
  "voiceover_script",
  "alt_text",
  "posting_recommendation",
] as const;

/** One canonical form for hashtags: no leading "#", trimmed, no blanks. */
export function normaliseHashtags(tags: readonly string[] | null | undefined): string[] {
  return (tags ?? [])
    .map((t) => t.trim().replace(/^#+/, "").trim())
    .filter(Boolean);
}

/** Parse the comma / "#"-separated field into canonical hashtags. */
export function parseHashtagField(value: string): string[] {
  return normaliseHashtags(value.split(/[#,\s]+/));
}

export function editorFieldsFrom(source: EditorSource): EditorFields {
  const out = { hashtags: normaliseHashtags(source.hashtags).join(", ") } as EditorFields;
  for (const key of TEXT_KEYS) out[key] = source[key] || "";
  return out;
}

/**
 * The payload for the fields that changed between `saved` and `next`
 * (empty object when nothing meaningful changed).
 */
export function changedFields(saved: EditorFields, next: EditorFields): EditorPayload {
  const payload: EditorPayload = {};
  for (const key of TEXT_KEYS) {
    const before = saved[key] || null;
    const after = next[key] || null;
    if (before !== after) payload[key] = after;
  }
  const beforeTags = parseHashtagField(saved.hashtags);
  const afterTags = parseHashtagField(next.hashtags);
  if (JSON.stringify(beforeTags) !== JSON.stringify(afterTags)) {
    payload.hashtags = afterTags;
  }
  return payload;
}
