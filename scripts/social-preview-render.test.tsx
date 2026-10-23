import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialPreview } from "../src/components/content/social-preview";

const base = { platform: "instagram", businessName: "Example Business" };

test("video media renders native controls without an image or decorative overlay", () => {
  const html = renderToStaticMarkup(createElement(SocialPreview, { ...base, mediaUrl: "/clip.mp4", mediaType: "video", onScreenText: "Proposed title" }));
  assert.match(html, /<video[^>]+controls=""/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /object-cover|bg-gradient|line-clamp/);
  assert.ok(html.indexOf("Proposed title") > html.indexOf("</video>"));
  assert.match(html, /Not included in the selected media/);
});

test("image review preserves the whole original and the full publication caption", () => {
  const html = renderToStaticMarkup(createElement(SocialPreview, { ...base, mediaUrl: "/photo.jpg", mediaType: "image", altText: "Salon interior", caption: "Our salon", callToAction: "Book today", hashtags: ["Salon"] }));
  assert.match(html, /<img[^>]+alt="Salon interior"/);
  assert.match(html, /object-contain/);
  assert.match(html, /Our salon\n\nBook today\n\n#Salon/);
});

test("missing media and unknown accounts are explicit rather than synthetic", () => {
  const html = renderToStaticMarkup(createElement(SocialPreview, { ...base }));
  assert.match(html, /Account not confirmed/);
  assert.match(html, /No media selected/);
  assert.doesNotMatch(html, /examplebusiness|Hook appears|generated caption will/);
});

test("account identity and unavailable-media errors remain visible and escaped", () => {
  const html = renderToStaticMarkup(createElement(SocialPreview, { ...base, accountHandle: "@actual-account", connectionStatus: "expired", mediaError: "Media <unavailable>" }));
  assert.match(html, /@actual-account/);
  assert.match(html, /Reconnect before publishing/);
  assert.match(html, /role="alert"/);
  assert.match(html, /Media &lt;unavailable&gt;/);
});
