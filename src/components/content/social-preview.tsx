"use client";

import { useState } from "react";
import { PlatformPill } from "@/components/content/platform-icons";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { buildPublishCaption } from "@/lib/content/publish-caption";
import type { SocialPlatform } from "@/lib/types";
import { cn } from "@/lib/utils";

function PreviewMedia({ url, type, alt }: { url: string; type: "image" | "video"; alt: string }) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, setAttempt] = useState(0);
  if (state === "failed") {
    return (
      <div role="alert" className="flex min-h-48 flex-col items-center justify-center gap-3 p-5 text-center text-sm">
        <p>The selected {type} could not be loaded. Refresh this page if its preview link has expired.</p>
        <Button variant="outline" className="min-h-11" onClick={() => { setState("loading"); setAttempt((value) => value + 1); }}>Retry media</Button>
      </div>
    );
  }
  return (
    <div className="relative flex min-h-48 items-center justify-center bg-muted">
      {state === "loading" ? <p role="status" className="absolute inset-x-0 top-3 text-center text-sm text-muted-foreground">Loading {type}…</p> : null}
      {type === "video" ? (
        <video key={attempt} src={url} controls playsInline preload="metadata" aria-label={alt || "Selected video"}
          onLoadedMetadata={() => setState("ready")} onError={() => setState("failed")}
          className="relative max-h-[32rem] w-full object-contain">
          Your browser cannot play this video. Open the original media to review it.
        </video>
      ) : (
        // Signed URLs are temporary and must show the original asset without cropping.
        // eslint-disable-next-line @next/next/no-img-element
        <img key={attempt} src={url} alt={alt || "Selected publication image"}
          onLoad={() => setState("ready")} onError={() => setState("failed")}
          className="relative max-h-[32rem] w-full object-contain" />
      )}
    </div>
  );
}

export function SocialPreview({
  platform, businessName, caption, hook, hashtags, callToAction, mediaUrl,
  mediaType, mediaError, altText, accountName, accountHandle, connectionStatus,
  onScreenText, editing, onCaptionChange,
}: {
  platform: string;
  businessName: string;
  caption?: string;
  hook?: string;
  hashtags?: string[];
  callToAction?: string | null;
  mediaUrl?: string | null;
  mediaType?: "image" | "video" | null;
  mediaError?: string | null;
  altText?: string | null;
  accountName?: string | null;
  accountHandle?: string | null;
  connectionStatus?: string | null;
  onScreenText?: string | null;
  editing?: boolean;
  onCaptionChange?: (value: string) => void;
}) {
  const body = buildPublishCaption({ caption, hook, hashtags, call_to_action: callToAction });
  const identity = accountHandle || accountName;
  return (
    <div className={cn("mx-auto w-full", platform === "tiktok" ? "max-w-[320px]" : "max-w-[360px]")}>
      <div className="overflow-hidden rounded-2xl border border-border/80 bg-background shadow-sm">
        <div className="flex items-center gap-2.5 border-b border-border/60 px-3.5 py-3">
          <div aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/15 font-heading text-xs font-semibold text-primary">
            {(businessName || "J").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{businessName || "Business"}</p>
            <p className="truncate text-xs text-muted-foreground">{identity || "Account not confirmed"}</p>
            {connectionStatus && connectionStatus !== "connected" ? <p className="text-xs text-destructive">Reconnect before publishing</p> : null}
          </div>
          <PlatformPill platform={platform as SocialPlatform} />
        </div>
        {mediaUrl && mediaType ? (
          <PreviewMedia key={`${mediaType}:${mediaUrl}`} url={mediaUrl} type={mediaType} alt={altText || ""} />
        ) : (
          <p role={mediaError ? "alert" : undefined} className="p-5 text-sm text-muted-foreground">
            {mediaError || (mediaUrl ? "Media type is unavailable. Open the content details to review the selected asset." : "No media selected. This preview contains caption text only.")}
          </p>
        )}
        <div className="space-y-3 border-t border-border/60 p-4">
          {editing && onCaptionChange ? (
            <div className="space-y-2">
              <label className="block text-sm font-medium">
                Caption
                <Textarea value={caption || ""} onChange={(event) => onCaptionChange(event.target.value)} rows={5} className="mt-2 resize-y text-sm" />
              </label>
              <p className="text-xs text-muted-foreground">Full caption with call to action and hashtags:</p>
            </div>
          ) : null}
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{body || "No caption prepared."}</p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">Selected original media and caption. Platform layout, cropping and processing may differ.</p>
      {onScreenText ? (
        <div className="mt-3 rounded-lg border border-dashed border-border p-3 text-sm">
          <p className="font-medium">Suggested on-screen text</p>
          <p className="mt-1 whitespace-pre-wrap break-words">{onScreenText}</p>
          <p className="mt-2 text-xs text-muted-foreground">Not included in the selected media. Add it in your media editor and upload the finished export before approval.</p>
        </div>
      ) : null}
    </div>
  );
}
