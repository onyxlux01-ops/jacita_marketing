export const FLYER_FORMATS = [
  {
    id: "square",
    label: "Square post",
    size: "1024x1024" as const,
    hint: "Instagram / feed",
  },
  {
    id: "story",
    label: "Story / flyer",
    size: "1024x1536" as const,
    hint: "Stories, print-style portrait",
  },
  {
    id: "wide",
    label: "Wide banner",
    size: "1536x1024" as const,
    hint: "Facebook / cover",
  },
] as const;

export type FlyerFormatId = (typeof FLYER_FORMATS)[number]["id"];

export const FLYER_MEDIA_MODES = [
  {
    id: "auto",
    label: "Auto",
    hint: "Sometimes uses your photos",
  },
  {
    id: "library",
    label: "Prefer library",
    hint: "Feature uploaded photos when available",
  },
  {
    id: "fresh",
    label: "Fresh only",
    hint: "AI art only — skip library photos",
  },
] as const;

export type FlyerMediaMode = (typeof FLYER_MEDIA_MODES)[number]["id"];
