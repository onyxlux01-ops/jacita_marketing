/**
 * Business-timezone conversion for schedule fields (no database).
 *   npm run test:timezone
 *
 * UK clock changes in 2026: BST starts Sunday 29 March at 01:00 UTC
 * (01:00 GMT -> 02:00 BST) and ends Sunday 25 October at 01:00 UTC
 * (02:00 BST -> 01:00 GMT) — the last Sundays of March and October.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatInTimeZone,
  fromZonedInputValue,
  normaliseTimeZone,
  timeZoneAbbreviation,
  timeZoneLabel,
  toZonedInputValue,
} from "../src/lib/timezone.ts";

const LDN = "Europe/London";

function parse(value: string, tz = LDN) {
  const r = fromZonedInputValue(value, tz);
  assert.ok(r.ok, `${value} should parse: ${JSON.stringify(r)}`);
  return r;
}

test("summer: an unchanged schedule round-trips (no one-hour drift)", () => {
  const stored = "2026-07-01T09:00:00.000Z"; // 10:00 BST
  const field = toZonedInputValue(stored, LDN);
  assert.equal(field, "2026-07-01T10:00");
  assert.equal(parse(field).iso, stored);
  // Saving it ten times in a row still lands on the same instant.
  let iso = stored;
  for (let i = 0; i < 10; i++) iso = parse(toZonedInputValue(iso, LDN)).iso;
  assert.equal(iso, stored);
});

test("winter: GMT equals UTC", () => {
  assert.equal(toZonedInputValue("2026-01-15T09:00:00.000Z", LDN), "2026-01-15T09:00");
  assert.equal(parse("2026-01-15T09:00").iso, "2026-01-15T09:00:00.000Z");
});

test("last Sunday of March: either side of the change", () => {
  assert.equal(parse("2026-03-28T12:00").iso, "2026-03-28T12:00:00.000Z"); // Sat, GMT
  assert.equal(parse("2026-03-29T00:59").iso, "2026-03-29T00:59:00.000Z"); // just before
  assert.equal(parse("2026-03-29T02:00").iso, "2026-03-29T01:00:00.000Z"); // first BST minute
  assert.equal(parse("2026-03-29T12:00").iso, "2026-03-29T11:00:00.000Z"); // Sun, BST
  assert.equal(toZonedInputValue("2026-03-29T00:59:00.000Z", LDN), "2026-03-29T00:59");
  assert.equal(toZonedInputValue("2026-03-29T01:00:00.000Z", LDN), "2026-03-29T02:00");
});

test("last Sunday of March: the skipped hour is refused, not guessed", () => {
  for (const v of ["2026-03-29T01:00", "2026-03-29T01:30", "2026-03-29T01:59"]) {
    const r = fromZonedInputValue(v, LDN);
    assert.equal(r.ok, false, v);
    assert.equal(!r.ok && r.reason, "nonexistent", v);
    assert.match(!r.ok ? r.message : "", /does not exist in Europe\/London/);
  }
});

test("last Sunday of October: either side of the change", () => {
  assert.equal(parse("2026-10-24T12:00").iso, "2026-10-24T11:00:00.000Z"); // Sat, BST
  assert.equal(parse("2026-10-25T00:30").iso, "2026-10-24T23:30:00.000Z"); // still BST
  assert.equal(parse("2026-10-25T02:00").iso, "2026-10-25T02:00:00.000Z"); // GMT
  assert.equal(parse("2026-10-25T12:00").iso, "2026-10-25T12:00:00.000Z"); // Sun, GMT
});

test("last Sunday of October: the repeated hour uses the first (BST) occurrence", () => {
  const r = parse("2026-10-25T01:30");
  assert.equal(r.iso, "2026-10-25T00:30:00.000Z");
  assert.equal(r.ambiguous, true);
  assert.equal(parse("2026-10-25T03:00").ambiguous, false);
  // Both instants display as 01:30 — the abbreviation tells them apart.
  assert.equal(toZonedInputValue("2026-10-25T00:30:00.000Z", LDN), "2026-10-25T01:30");
  assert.equal(toZonedInputValue("2026-10-25T01:30:00.000Z", LDN), "2026-10-25T01:30");
  assert.equal(timeZoneAbbreviation(LDN, "2026-10-25T00:30:00.000Z"), "BST");
  assert.equal(timeZoneAbbreviation(LDN, "2026-10-25T01:30:00.000Z"), "GMT");
});

test("labels name the zone and its current abbreviation", () => {
  assert.equal(timeZoneLabel(LDN, "2026-07-01T09:00:00.000Z"), "Europe/London (BST)");
  assert.equal(timeZoneLabel(LDN, "2026-01-15T09:00:00.000Z"), "Europe/London (GMT)");
  assert.match(formatInTimeZone("2026-07-01T09:00:00.000Z", LDN), /10:00 BST$/);
});

test("another business zone is honoured (not the browser's)", () => {
  const NY = "America/New_York";
  assert.equal(toZonedInputValue("2026-07-01T14:00:00.000Z", NY), "2026-07-01T10:00");
  assert.equal(parse("2026-07-01T10:00", NY).iso, "2026-07-01T14:00:00.000Z");
});

test("malformed input and unknown zones", () => {
  for (const v of ["", "tomorrow", "2026-02-31T10:00", "2026-13-01T10:00", "2026-01-01T24:00"]) {
    const r = fromZonedInputValue(v, LDN);
    assert.equal(r.ok, false, v);
    assert.equal(!r.ok && r.reason, "invalid", v);
  }
  assert.equal(toZonedInputValue("not a date", LDN), "");
  assert.equal(toZonedInputValue(null, LDN), "");
  assert.equal(normaliseTimeZone("Mars/Olympus"), LDN);
  assert.equal(normaliseTimeZone(null), LDN);
});
