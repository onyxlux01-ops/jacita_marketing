import { facebookAdapter } from "@/lib/social/adapters/facebook";
import { instagramAdapter } from "@/lib/social/adapters/instagram";
import { tiktokAdapter } from "@/lib/social/adapters/tiktok";
import type { SocialPlatformAdapter } from "@/lib/social/types";
import type { SocialPlatform } from "@/lib/types";

const adapters: Record<SocialPlatform, SocialPlatformAdapter> = {
  facebook: facebookAdapter,
  instagram: instagramAdapter,
  tiktok: tiktokAdapter,
};

export function getSocialAdapter(platform: SocialPlatform): SocialPlatformAdapter {
  return adapters[platform];
}

export function listSocialAdapters() {
  return Object.values(adapters);
}
