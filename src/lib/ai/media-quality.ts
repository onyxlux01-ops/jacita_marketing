import type { BusinessContext } from "@/lib/ai/context";

export type MediaQualityIssue = {
  mediaId: string;
  suitable: boolean;
  notes: string[];
};

type MediaItem = BusinessContext["media"][number] & {
  width?: number | null;
  height?: number | null;
  duration_seconds?: number | null;
  file_size_bytes?: number | null;
  aspect_ratio?: string | null;
};

const PLATFORM_RULES: Record<
  string,
  {
    preferVideo?: boolean;
    preferImage?: boolean;
    minWidth?: number;
    maxDurationSec?: number;
    preferredAspect?: string[];
  }
> = {
  instagram: {
    minWidth: 1080,
    preferredAspect: ["1:1", "4:5", "9:16"],
  },
  tiktok: {
    preferVideo: true,
    preferredAspect: ["9:16"],
    maxDurationSec: 180,
    minWidth: 720,
  },
  facebook: {
    preferredAspect: ["1:1", "16:9", "4:5"],
    minWidth: 600,
  },
};

function aspectFromDims(w?: number | null, h?: number | null) {
  if (!w || !h) return null;
  const ratio = w / h;
  if (Math.abs(ratio - 1) < 0.08) return "1:1";
  if (Math.abs(ratio - 0.8) < 0.08) return "4:5";
  if (Math.abs(ratio - 9 / 16) < 0.08) return "9:16";
  if (Math.abs(ratio - 16 / 9) < 0.08) return "16:9";
  return `${w}:${h}`;
}

export function assessMediaQuality(options: {
  media: MediaItem;
  platform: string;
  contentType?: string | null;
}): MediaQualityIssue {
  const notes: string[] = [];
  const rules = PLATFORM_RULES[options.platform] || PLATFORM_RULES.instagram;
  const m = options.media;
  const isVideo = m.media_type === "video";
  const isReelLike =
    /reel|short_video|tiktok|video/i.test(options.contentType || "") ||
    options.platform === "tiktok";

  if (rules.preferVideo && !isVideo) {
    notes.push(
      `${options.platform} prefers video for this format — this asset is an image.`
    );
  }
  if (isReelLike && !isVideo) {
    notes.push("Reel/short-video formats work best with video assets.");
  }

  const aspect =
    m.aspect_ratio || aspectFromDims(m.width ?? null, m.height ?? null);
  if (
    aspect &&
    rules.preferredAspect &&
    !rules.preferredAspect.includes(aspect)
  ) {
    notes.push(
      `Aspect ${aspect} is not ideal for ${options.platform} (prefer ${rules.preferredAspect.join(", ")}).`
    );
  }

  if (m.width && rules.minWidth && m.width < rules.minWidth) {
    notes.push(
      `Resolution width ${m.width}px is below the recommended ${rules.minWidth}px.`
    );
  }

  if (
    isVideo &&
    m.duration_seconds &&
    rules.maxDurationSec &&
    Number(m.duration_seconds) > rules.maxDurationSec
  ) {
    notes.push(
      `Video duration ${m.duration_seconds}s exceeds typical ${options.platform} short-form length.`
    );
  }

  if (m.file_size_bytes && m.file_size_bytes > 100 * 1024 * 1024) {
    notes.push("File size is very large and may fail platform uploads.");
  }

  if (!m.width && !m.height && !m.aspect_ratio && !m.duration_seconds) {
    notes.push(
      "Media dimensions/duration not recorded — suitability could not be fully verified."
    );
  }

  const blocking = notes.some(
    (n) =>
      n.includes("prefers video") ||
      n.includes("below the recommended") ||
      n.includes("exceeds typical")
  );

  return {
    mediaId: m.id,
    suitable: !blocking,
    notes,
  };
}

export function assessMediaList(options: {
  context: BusinessContext;
  mediaIds: string[];
  platform: string;
  contentType?: string | null;
}) {
  return options.mediaIds
    .map((id) => options.context.media.find((m) => m.id === id))
    .filter((m): m is BusinessContext["media"][number] => Boolean(m))
    .map((m) =>
      assessMediaQuality({
        media: m,
        platform: options.platform,
        contentType: options.contentType,
      })
    );
}
