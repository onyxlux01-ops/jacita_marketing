"use client";

import { PlatformPill } from "@/components/content/platform-icons";
import { Textarea } from "@/components/ui/textarea";
import type { SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

export function SocialPreview({
  platform,
  businessName,
  caption,
  hook,
  hashtags,
  mediaUrl,
  onScreenText,
  editing,
  onCaptionChange,
}: {
  platform: string;
  businessName: string;
  caption?: string;
  hook?: string;
  hashtags?: string[];
  mediaUrl?: string | null;
  onScreenText?: string | null;
  editing?: boolean;
  onCaptionChange?: (value: string) => void;
}) {
  const handle = businessName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 18);
  const body =
    caption ||
    hook ||
    "Your generated caption will appear here in a realistic social preview.";
  const tags = (hashtags ?? [])
    .map((h) => (h.startsWith("#") ? h : `#${h}`))
    .join(" ");

  const isTikTok = platform === "tiktok";
  const isFacebook = platform === "facebook";

  return (
    <div className={cn("mx-auto w-full", isTikTok ? "max-w-[280px]" : "max-w-[360px]")}>
      <div
        className={cn(
          "overflow-hidden border border-border/80 bg-background shadow-[0_12px_40px_rgba(15,18,24,0.08)]",
          isTikTok ? "rounded-[1.5rem]" : "rounded-[1.25rem]"
        )}
      >
        {!isTikTok ? (
          <div className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-primary/15 font-heading text-xs font-semibold text-primary">
              {(businessName || "J").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {isFacebook ? businessName || "Your business" : handle || "yourbrand"}
              </p>
              <p className="text-[11px] capitalize text-muted-foreground">
                {platform} preview
              </p>
            </div>
            <PlatformPill platform={platform as SocialPlatform} />
          </div>
        ) : null}

        <div
          className={cn(
            "relative bg-gradient-to-br from-[#dfe8e6] via-[#eef2f1] to-[#c9d9d6]",
            isTikTok ? "aspect-[9/16]" : isFacebook ? "aspect-[1.2/1]" : "aspect-square"
          )}
        >
          {mediaUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mediaUrl}
              alt={hook || "Selected media"}
              className="absolute inset-0 size-full object-cover"
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
          <div className="absolute inset-x-0 bottom-0 space-y-2 p-4">
            {isTikTok ? (
              <div className="mb-8">
                <p className="text-sm font-semibold text-white">@{handle || "brand"}</p>
                <p className="mt-1 text-xs text-white/90 line-clamp-3">
                  {hook || body}
                </p>
              </div>
            ) : (
              <p className="max-w-[90%] font-heading text-lg font-semibold leading-snug text-white">
                {onScreenText || hook || "Hook appears over media"}
              </p>
            )}
          </div>
          {isTikTok && onScreenText ? (
            <div className="absolute left-1/2 top-1/3 -translate-x-1/2 rounded-md bg-black/50 px-3 py-1.5 text-center text-sm font-semibold text-white">
              {onScreenText}
            </div>
          ) : null}
        </div>

        {!isTikTok ? (
          <div className="space-y-3 p-4">
            {editing && onCaptionChange ? (
              <Textarea
                value={caption || ""}
                onChange={(e) => onCaptionChange(e.target.value)}
                rows={6}
                className="resize-none text-sm"
              />
            ) : (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{body}</p>
            )}
            {tags ? <p className="text-sm text-primary/90">{tags}</p> : null}
          </div>
        ) : (
          <div className="space-y-2 border-t border-border/60 px-3 py-3">
            <p className="text-[11px] text-muted-foreground">Caption</p>
            {editing && onCaptionChange ? (
              <Textarea
                value={caption || ""}
                onChange={(e) => onCaptionChange(e.target.value)}
                rows={4}
                className="resize-none text-sm"
              />
            ) : (
              <p className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">
                {caption || body}
              </p>
            )}
            {tags ? <p className="text-xs text-primary/90">{tags}</p> : null}
          </div>
        )}
      </div>
    </div>
  );
}
