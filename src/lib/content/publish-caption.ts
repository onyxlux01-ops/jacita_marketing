/** The caption sent to social providers and displayed for publication review. */
export function buildPublishCaption(input: {
  caption?: string | null;
  hook?: string | null;
  call_to_action?: string | null;
  hashtags?: readonly string[] | null;
}) {
  return [
    input.caption || input.hook || "",
    input.call_to_action || "",
    (input.hashtags ?? [])
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .join(" "),
  ].filter(Boolean).join("\n\n");
}
