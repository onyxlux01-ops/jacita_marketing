// Mock of "@/lib/social/registry": fake platform adapters that record every
// publish request instead of calling Meta/TikTok.
import { itest } from "../state";
import type {
  SocialPlatformAdapter,
  PublishContentInput,
} from "../../../src/lib/social/types";
import type { SocialPlatform } from "../../../src/lib/types";

function fakeAdapter(platform: SocialPlatform): SocialPlatformAdapter {
  return {
    platform,
    isConfigured: () => true,
    getAuthorizationUrl: ({ state, redirectUri, credentials }) =>
      `https://provider.test/${platform}/oauth?state=${state}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&client_id=${credentials?.appId ?? "env"}`,
    exchangeCode: async () => {
      throw new Error("[itest] exchangeCode not mocked");
    },
    validatePublish: () => [],
    publish: async (_token, account, input: PublishContentInput) => {
      if (itest.publishDelayMs) {
        await new Promise((r) => setTimeout(r, itest.publishDelayMs));
      }
      itest.postCounter += 1;
      itest.publishCalls.push({
        platform,
        externalAccountId: account.externalAccountId,
        contentId: input.contentId,
        organisationId: input.organisationId,
      });
      // The request "reached" the provider, then the connection failed.
      if (itest.publishError) throw new Error(itest.publishError);
      return {
        externalPostId: `${platform}-post-${itest.postCounter}`,
        status: "published",
      };
    },
  } as SocialPlatformAdapter;
}

const adapters: Record<SocialPlatform, SocialPlatformAdapter> = {
  facebook: fakeAdapter("facebook"),
  instagram: fakeAdapter("instagram"),
  tiktok: fakeAdapter("tiktok"),
};

export function getSocialAdapter(platform: SocialPlatform) {
  return adapters[platform];
}

export function listSocialAdapters() {
  return Object.values(adapters);
}
