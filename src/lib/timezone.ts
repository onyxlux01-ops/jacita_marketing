/**
 * Business-timezone helpers for `<input type="datetime-local">`.
 *
 * A datetime-local value ("YYYY-MM-DDTHH:mm") has no zone. The browser's own
 * zone is irrelevant here: schedule times are the BUSINESS's wall-clock time
 * (organisations.timezone, an IANA name such as "Europe/London"). Format a
 * stored UTC instant into that zone for the field, and convert the field
 * back to UTC exactly once, on save.
 *
 * Pure `Intl` — safe on server and client, no dependencies.
 */

export const DEFAULT_TIME_ZONE = "Europe/London";

const LOCAL_VALUE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function isValidTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The business's zone, or Europe/London if it is missing or unknown. */
export function normaliseTimeZone(tz: string | null | undefined) {
  return isValidTimeZone(tz) ? tz : DEFAULT_TIME_ZONE;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(tz, f);
  }
  return f;
}

function wallClock(utcMs: number, tz: string) {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour === 24 ? 0 : out.hour,
    minute: out.minute,
    second: out.second,
  };
}

/** Offset of `tz` from UTC at the given instant, in ms (BST = +3_600_000). */
export function timeZoneOffsetMs(utcMs: number, tz: string) {
  const w = wallClock(utcMs, tz);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * UTC ISO instant → datetime-local value in the business zone.
 * Returns "" for a missing or invalid instant.
 */
export function toZonedInputValue(
  iso: string | null | undefined,
  tz: string
): string {
  if (!iso) return "";
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return "";
  const w = wallClock(ms, normaliseTimeZone(tz));
  return `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${pad(w.minute)}`;
}

export type ZonedParse =
  | { ok: true; iso: string; ambiguous: boolean }
  | { ok: false; reason: "invalid" | "nonexistent"; message: string };

/**
 * datetime-local value (business wall-clock time) → UTC ISO instant.
 *
 * - A time skipped when the clocks go forward (e.g. 01:30 on the last
 *   Sunday of March in the UK) does not exist: refused with a message.
 * - A time that happens twice when the clocks go back (01:30 on the last
 *   Sunday of October) resolves to the FIRST occurrence (still summer time)
 *   and is flagged `ambiguous` so the UI can say which one was used.
 */
export function fromZonedInputValue(value: string, tz: string): ZonedParse {
  const zone = normaliseTimeZone(tz);
  const m = LOCAL_VALUE.exec(value.trim());
  if (!m) {
    return { ok: false, reason: "invalid", message: "Enter a valid date and time" };
  }
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) {
    return { ok: false, reason: "invalid", message: "Enter a valid date and time" };
  }
  const naive = Date.UTC(y, mo - 1, d, h, mi);
  // Calendar overflow (e.g. 31 February) → invalid.
  const check = new Date(naive);
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) {
    return { ok: false, reason: "invalid", message: "Enter a valid date and time" };
  }

  // The offset either side of the moment covers any transition that day.
  const offsets = new Set([
    timeZoneOffsetMs(naive - 12 * 3600_000, zone),
    timeZoneOffsetMs(naive + 12 * 3600_000, zone),
  ]);
  const matches = [...offsets]
    .map((off) => naive - off)
    .filter((utc) => toZonedInputValue(new Date(utc).toISOString(), zone) === value.trim())
    .sort((a, b) => a - b);

  if (!matches.length) {
    return {
      ok: false,
      reason: "nonexistent",
      message: `${value.replace("T", " ")} does not exist in ${zone} (the clocks go forward). Pick a time outside the change.`,
    };
  }
  return {
    ok: true,
    iso: new Date(matches[0]).toISOString(),
    ambiguous: matches.length > 1,
  };
}

/** Short zone name at an instant, e.g. "BST" / "GMT" for Europe/London. */
export function timeZoneAbbreviation(tz: string, at: Date | string | number = Date.now()) {
  const zone = normaliseTimeZone(tz);
  const part = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    timeZoneName: "short",
  })
    .formatToParts(new Date(at))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? zone;
}

/** "Europe/London (BST)" — the label shown next to schedule fields. */
export function timeZoneLabel(tz: string, at: Date | string | number = Date.now()) {
  const zone = normaliseTimeZone(tz);
  return `${zone} (${timeZoneAbbreviation(zone, at)})`;
}

/** Human date/time in the business zone, with its abbreviation. */
export function formatInTimeZone(iso: string | null | undefined, tz: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const zone = normaliseTimeZone(tz);
  const text = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(d);
  return `${text} ${timeZoneAbbreviation(zone, d)}`;
}
