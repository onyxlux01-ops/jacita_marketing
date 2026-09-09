/**
 * Meta Marketing API adapter — separate from organic SocialPlatformAdapter.
 * AI never calls this directly; only structured advertising_actions after approval.
 */
import { metaFetch, getMetaAppCredentials } from "@/lib/social/meta-client";
import type { TokenBundle } from "@/lib/social/types";
import { SocialIntegrationError } from "@/lib/social/types";

export type MetaAdAccountInfo = {
  externalAdAccountId: string;
  name: string | null;
  currency: string | null;
  timezoneName: string | null;
  accountStatus: string | null;
  raw?: Record<string, unknown>;
};

export type MetaCampaignInfo = {
  externalCampaignId: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  effectiveStatus: string | null;
  dailyBudgetCents: number | null;
  lifetimeBudgetCents: number | null;
  raw?: Record<string, unknown>;
};

export type MetaCampaignInsights = {
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  raw?: Record<string, unknown>;
};

export type CreateCampaignInput = {
  name: string;
  objective: string;
  status?: "PAUSED" | "ACTIVE";
  dailyBudgetCents?: number | null;
  lifetimeBudgetCents?: number | null;
  specialAdCategories?: string[];
};

function requireAdsToken(token: TokenBundle) {
  const access = token.accessToken;
  if (!access) {
    throw new SocialIntegrationError(
      "Missing Meta user token for ads",
      "token_expired",
      "Reconnect Facebook with ads permissions to manage ad accounts."
    );
  }
  return access;
}

function adAccountPath(externalId: string) {
  return externalId.startsWith("act_") ? `/${externalId}` : `/act_${externalId}`;
}

export const metaAdsAdapter = {
  isConfigured() {
    return Boolean(getMetaAppCredentials());
  },

  async listAdAccounts(token: TokenBundle): Promise<MetaAdAccountInfo[]> {
    const access = requireAdsToken(token);
    const res = await metaFetch<{
      data?: Array<{
        id: string;
        name?: string;
        currency?: string;
        timezone_name?: string;
        account_status?: number | string;
      }>;
      error?: { message?: string };
    }>("/me/adaccounts", {
      searchParams: {
        access_token: access,
        fields: "id,name,currency,timezone_name,account_status",
        limit: "50",
      },
    });

    return (res.data || []).map((a) => ({
      externalAdAccountId: a.id,
      name: a.name ?? null,
      currency: a.currency ?? null,
      timezoneName: a.timezone_name ?? null,
      accountStatus:
        a.account_status !== undefined && a.account_status !== null
          ? String(a.account_status)
          : null,
      raw: a as unknown as Record<string, unknown>,
    }));
  },

  async getAdAccount(
    token: TokenBundle,
    externalAdAccountId: string
  ): Promise<MetaAdAccountInfo> {
    const access = requireAdsToken(token);
    const a = await metaFetch<{
      id: string;
      name?: string;
      currency?: string;
      timezone_name?: string;
      account_status?: number | string;
    }>(adAccountPath(externalAdAccountId), {
      searchParams: {
        access_token: access,
        fields: "id,name,currency,timezone_name,account_status",
      },
    });
    return {
      externalAdAccountId: a.id,
      name: a.name ?? null,
      currency: a.currency ?? null,
      timezoneName: a.timezone_name ?? null,
      accountStatus:
        a.account_status !== undefined && a.account_status !== null
          ? String(a.account_status)
          : null,
      raw: a as unknown as Record<string, unknown>,
    };
  },

  async listCampaigns(
    token: TokenBundle,
    externalAdAccountId: string
  ): Promise<MetaCampaignInfo[]> {
    const access = requireAdsToken(token);
    const res = await metaFetch<{
      data?: Array<{
        id: string;
        name?: string;
        objective?: string;
        status?: string;
        effective_status?: string;
        daily_budget?: string;
        lifetime_budget?: string;
      }>;
    }>(`${adAccountPath(externalAdAccountId)}/campaigns`, {
      searchParams: {
        access_token: access,
        fields:
          "id,name,objective,status,effective_status,daily_budget,lifetime_budget",
        limit: "50",
      },
    });

    return (res.data || []).map((c) => ({
      externalCampaignId: c.id,
      name: c.name ?? null,
      objective: c.objective ?? null,
      status: c.status ?? null,
      effectiveStatus: c.effective_status ?? null,
      dailyBudgetCents: c.daily_budget ? Number(c.daily_budget) : null,
      lifetimeBudgetCents: c.lifetime_budget
        ? Number(c.lifetime_budget)
        : null,
      raw: c as unknown as Record<string, unknown>,
    }));
  },

  async getCampaignInsights(
    token: TokenBundle,
    externalCampaignId: string,
    datePreset = "last_7d"
  ): Promise<MetaCampaignInsights> {
    const access = requireAdsToken(token);
    const res = await metaFetch<{
      data?: Array<{
        impressions?: string;
        clicks?: string;
        spend?: string;
        reach?: string;
      }>;
    }>(`/${externalCampaignId}/insights`, {
      searchParams: {
        access_token: access,
        fields: "impressions,clicks,spend,reach",
        date_preset: datePreset,
      },
    });
    const row = res.data?.[0] || {};
    return {
      impressions: Number(row.impressions || 0),
      clicks: Number(row.clicks || 0),
      spend: Number(row.spend || 0),
      reach: Number(row.reach || 0),
      raw: row as Record<string, unknown>,
    };
  },

  async createCampaign(
    token: TokenBundle,
    externalAdAccountId: string,
    input: CreateCampaignInput
  ): Promise<MetaCampaignInfo> {
    const access = requireAdsToken(token);
    const body: Record<string, unknown> = {
      access_token: access,
      name: input.name,
      objective: input.objective,
      status: input.status || "PAUSED",
      special_ad_categories: input.specialAdCategories || [],
    };
    if (input.dailyBudgetCents != null) {
      body.daily_budget = String(input.dailyBudgetCents);
    }
    if (input.lifetimeBudgetCents != null) {
      body.lifetime_budget = String(input.lifetimeBudgetCents);
    }

    const created = await metaFetch<{ id?: string }>(
      `${adAccountPath(externalAdAccountId)}/campaigns`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    if (!created.id) {
      throw new SocialIntegrationError(
        "Meta create campaign returned no id",
        "platform_error"
      );
    }

    return {
      externalCampaignId: created.id,
      name: input.name,
      objective: input.objective,
      status: input.status || "PAUSED",
      effectiveStatus: input.status || "PAUSED",
      dailyBudgetCents: input.dailyBudgetCents ?? null,
      lifetimeBudgetCents: input.lifetimeBudgetCents ?? null,
    };
  },

  async updateCampaignStatus(
    token: TokenBundle,
    externalCampaignId: string,
    status: "PAUSED" | "ACTIVE"
  ): Promise<{ externalCampaignId: string; status: string }> {
    const access = requireAdsToken(token);
    await metaFetch(`/${externalCampaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        access_token: access,
        status,
      }),
    });
    return { externalCampaignId, status };
  },

  async updateCampaign(
    token: TokenBundle,
    externalCampaignId: string,
    patch: {
      name?: string;
      dailyBudgetCents?: number | null;
      status?: "PAUSED" | "ACTIVE";
    }
  ): Promise<{ externalCampaignId: string }> {
    const access = requireAdsToken(token);
    const body: Record<string, unknown> = { access_token: access };
    if (patch.name) body.name = patch.name;
    if (patch.status) body.status = patch.status;
    if (patch.dailyBudgetCents != null) {
      body.daily_budget = String(patch.dailyBudgetCents);
    }
    await metaFetch(`/${externalCampaignId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { externalCampaignId };
  },
};
