import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPublishCaption } from "../src/lib/content/publish-caption.ts";
import { describePublishOutcome } from "../src/lib/content/publish-outcome.ts";

test("review and publishing preserve caption, CTA and hashtags in provider order", () => {
  assert.equal(buildPublishCaption({ caption: "Fresh colour ✨", hook: "An unused hook", call_to_action: "Book your appointment", hashtags: ["Hair", "#London"] }), "Fresh colour ✨\n\nBook your appointment\n\n#Hair #London");
});

test("empty captions use the hook without inventing preview text", () => {
  assert.equal(buildPublishCaption({ caption: "", hook: "See our new service" }), "See our new service");
  assert.equal(buildPublishCaption({}), "");
});

test("an error, a pending provider result or an unknown response never claims publication", () => {
  assert.equal(describePublishOutcome({ error: "Held for review", success: true, status: "published" }).tone, "error");
  assert.equal(describePublishOutcome({ success: true, status: "publishing", externalUrl: "https://example.com/post" }).tone, "info");
  assert.equal(describePublishOutcome({}).tone, "info");
  assert.equal(describePublishOutcome({ inProgress: true, message: "Still working" }).message, "Still working");
});

test("confirmed, duplicate and simulated results are distinguished", () => {
  assert.equal(describePublishOutcome({ success: true, status: "published" }).tone, "success");
  assert.match(describePublishOutcome({ success: true, status: "published", duplicate: true }).message, /No new post/);
  assert.equal(describePublishOutcome({ success: true, status: "published", simulated: true }).tone, "info");
  assert.match(describePublishOutcome({ simulated: true }).message, /No live post/);
});

test("provider links accept web URLs only after confirmed publication", () => {
  assert.equal(describePublishOutcome({ success: true, status: "published", externalUrl: "https://example.com/post/123" }).url, "https://example.com/post/123");
  assert.equal(describePublishOutcome({ success: true, status: "published", externalUrl: "javascript:alert(1)" }).url, undefined);
  assert.equal(describePublishOutcome({ success: true, status: "publishing", externalUrl: "https://example.com/post/123" }).url, undefined);
});
