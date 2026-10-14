/**
 * Post-login redirect targets (open-redirect guard). npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNextPath } from "../src/lib/safe-next.ts";

const ORIGIN = "https://app.example.com";

test("same-origin paths are kept (path, query, hash)", () => {
  assert.equal(safeNextPath("/app", ORIGIN), "/app");
  assert.equal(safeNextPath("/invite/abc?x=1#y", ORIGIN), "/invite/abc?x=1#y");
  assert.equal(safeNextPath("/reset-password", ORIGIN), "/reset-password");
  // A full URL on our own origin is reduced to its path.
  assert.equal(safeNextPath("https://app.example.com/app/content", ORIGIN), "/app/content");
});

test("other hosts are refused, however they are spelled", () => {
  const evil = [
    "//evil.example",
    "//evil.example/app",
    "/\t/evil.example", // tab is stripped by the URL parser
    "/\n/evil.example", // newline too
    "/\r\n/evil.example",
    "/\\evil.example", // backslash is a slash for http(s)
    "\\\\evil.example",
    "/\\/evil.example",
    "https://evil.example/app",
    "http://app.example.com/app", // different scheme = different origin
    "javascript:alert(1)",
    "data:text/html,hi",
    " //evil.example",
  ];
  for (const next of evil) {
    assert.equal(safeNextPath(next, ORIGIN), "/app", JSON.stringify(next));
  }
});

test("an encoded %2F%2F stays a harmless same-origin path", () => {
  const out = safeNextPath("/%2F%2Fevil.example", ORIGIN);
  assert.equal(out, "/%2F%2Fevil.example");
  assert.equal(new URL(out, ORIGIN).origin, ORIGIN);
  const bare = safeNextPath("%2F%2Fevil.example", ORIGIN);
  assert.equal(new URL(bare, ORIGIN).origin, ORIGIN);
});

test("missing or unparsable values fall back", () => {
  assert.equal(safeNextPath(null, ORIGIN), "/app");
  assert.equal(safeNextPath("", ORIGIN), "/app");
  assert.equal(safeNextPath("http://[::1", ORIGIN), "/app");
  assert.equal(safeNextPath("/x", "not an origin"), "/app");
  assert.equal(safeNextPath("//evil.example", ORIGIN, "/login"), "/login");
});
