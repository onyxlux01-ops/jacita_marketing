import { createAdminClient } from "@/lib/supabase/admin";
import { loadAccountSecrets } from "@/lib/social/secrets";
import { metaAdsAdapter } from "@/lib/ads/meta-ads-adapter";
import type { Json, Tables } from "@/lib/database.types";

export type AdvertisingActionType =
  | "CREATE_CAMPAIGN"
  | "UPDATE_CAMPAIGN"
  | "PAUSE_CAMPAIGN"
  | "ENABLE_CAMPAIGN"
  | "GET_CAMPAIGN_INSIGHTS"
  | "GET_AD_ACCOUNT"
  | "LIST_CAMPAIGNS"
  | "DISCOVER_AD_ACCOUNTS"
  | "LINK_AD_ACCOUNT";

export type AdvertisingSettings = {
  organisation_id: string;
  mode: "off" | "approval" | "autopilot";
  daily_spend_limit_cents: number;
  max_active_campaigns: number;
  emergency_stopped: boolean;
  /** How daily_spend_limit_cents applies (see 20261014170000_ads_execution_limits). */
  limit_scope: AdLimitScope;
  limit_period: AdLimitPeriod;
};

export type AdLimitScope = "per_campaign" | "business_total";
export type AdLimitPeriod = "daily" | "lifetime";

const MUTATING_ACTIONS: AdvertisingActionType[] = [
  "CREATE_CAMPAIGN",
  "UPDATE_CAMPAIGN",
  "PAUSE_CAMPAIGN",
  "ENABLE_CAMPAIGN",
  "LINK_AD_ACCOUNT",
];

function toAdvertisingSettings(
  row: Tables<"advertising_settings">
): AdvertisingSettings {
  return {
    organisation_id: row.organisation_id,
    mode: row.mode as AdvertisingSettings["mode"],
    daily_spend_limit_cents: Number(row.daily_spend_limit_cents),
    max_active_campaigns: row.max_active_campaigns,
    emergency_stopped: row.emergency_stopped,
    limit_scope: (row.limit_scope as AdLimitScope) || "per_campaign",
    limit_period: (row.limit_period as AdLimitPeriod) || "daily",
  };
}

export async function ensureAdvertisingSettings(organisationId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("advertising_settings")
    .select("*")
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (data) return toAdvertisingSettings(data);

  const { data: created, error } = await db
    .from("advertising_settings")
    .insert({
      organisation_id: organisationId,
      mode: "approval",
      daily_spend_limit_cents: 0,
      max_active_campaigns: 5,
      emergency_stopped: false,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return toAdvertisingSettings(created);
}

export async function assertOrgMembership(
  organisationId: string,
  userId: string,
  manage = false
) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return { error: "Unauthorized for this business" as const };
  if (manage && !["owner", "manager"].includes(data.role)) {
    return { error: "Only owners and managers can manage advertising" as const };
  }
  return { role: data.role };
}

/**
 * Load Meta user token from the org's connected Facebook social account.
 * Ads use the user token (not page token). Org-scoped — never cross-business.
 */
export async function loadOrgMetaUserToken(organisationId: string) {
  const admin = createAdminClient();
  const { data: account } = await admin
    .from("social_accounts")
    .select("id, organisation_id, connection_status, scopes")
    .eq("organisation_id", organisationId)
    .eq("platform", "facebook")
    .eq("connection_status", "connected")
    .maybeSingle();

  if (!account) {
    return {
      error:
        "Connect Facebook for this business first (required for Meta Ads tokens)." as const,
    };
  }

  const token = await loadAccountSecrets(account.id, organisationId);
  if (!token?.accessToken) {
    return { error: "Missing Facebook credentials. Reconnect Facebook." as const };
  }

  const scopes = account.scopes || [];
  const hasAds =
    scopes.includes("ads_read") || scopes.includes("ads_management");
  return { token, socialAccountId: account.id, hasAdsScopes: hasAds };
}

export async function getMetaSurfaceForOrganisation(organisationId: string) {
  const db = createAdminClient();
  const [{ data: social }, { data: adAccounts }, settings, { data: pending }] =
    await Promise.all([
      db
        .from("social_accounts")
        .select(
          "platform, connection_status, account_name, account_handle, external_account_id, scopes"
        )
        .eq("organisation_id", organisationId)
        .in("platform", ["instagram", "facebook"]),
      db
        .from("meta_ad_accounts")
        .select("id, name, external_ad_account_id, status, currency")
        .eq("organisation_id", organisationId)
        .eq("status", "connected"),
      ensureAdvertisingSettings(organisationId),
      db
        .from("advertising_actions")
        .select("id, action_type, status, payload, created_at")
        .eq("organisation_id", organisationId)
        .eq("status", "proposed")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

  const ig = (social || []).find((s) => s.platform === "instagram");
  const fb = (social || []).find((s) => s.platform === "facebook");
  const primaryAd = (adAccounts || [])[0] || null;
  const fbScopes = fb?.scopes || [];
  const hasAdsScopes =
    fbScopes.includes("ads_read") || fbScopes.includes("ads_management");

  let activeCampaigns = 0;
  const spend7d = 0;
  if (primaryAd?.id) {
    const { data: campaigns } = await db
      .from("meta_ad_campaigns")
      .select("id, effective_status, status")
      .eq("organisation_id", organisationId)
      .eq("meta_ad_account_id", primaryAd.id);
    activeCampaigns = (campaigns || []).filter(
      (c) =>
        (c.effective_status || c.status || "").toUpperCase() === "ACTIVE"
    ).length;
  }

  return {
    organisationId,
    instagram: {
      connected: ig?.connection_status === "connected",
      name: ig?.account_handle || ig?.account_name || null,
    },
    facebook: {
      connected: fb?.connection_status === "connected",
      name: fb?.account_name || null,
      hasAdsScopes,
    },
    adAccount: primaryAd
      ? ({
          connected: true as const,
          id: primaryAd.id,
          name: primaryAd.name || null,
          externalId: primaryAd.external_ad_account_id,
          currency: primaryAd.currency || null,
        })
      : ({ connected: false as const }),
    advertising: {
      mode: settings.mode,
      emergencyStopped: settings.emergency_stopped,
      dailySpendLimitCents: settings.daily_spend_limit_cents,
      maxActiveCampaigns: settings.max_active_campaigns,
      limitScope: settings.limit_scope,
      limitPeriod: settings.limit_period,
      activeCampaigns,
      spend7d,
      pendingApprovals: (pending || []).map((p) => ({
        id: p.id,
        action_type: p.action_type,
        status: p.status,
        payload: p.payload,
        created_at: p.created_at,
      })),
    },
  };
}

export async function proposeAdvertisingAction(input: {
  organisationId: string;
  userId: string;
  actionType: AdvertisingActionType;
  payload: Record<string, unknown>;
  metaAdAccountId?: string | null;
  proposedBy?: "ai" | "user" | "system";
}) {
  const membership = await assertOrgMembership(
    input.organisationId,
    input.userId,
    true
  );
  if ("error" in membership) return membership;

  const settings = await ensureAdvertisingSettings(input.organisationId);
  if (settings.mode === "off") {
    return { error: "Advertising is turned off for this business." as const };
  }
  // Pausing only reduces spend, so it stays possible during an emergency stop.
  if (
    settings.emergency_stopped &&
    MUTATING_ACTIONS.includes(input.actionType) &&
    input.actionType !== "PAUSE_CAMPAIGN"
  ) {
    return {
      error: "Advertising emergency stop is active. Resume before proposing mutations." as const,
    };
  }

  if (input.metaAdAccountId) {
    const db = createAdminClient();
    const { data: acct } = await db
      .from("meta_ad_accounts")
      .select("id")
      .eq("id", input.metaAdAccountId)
      .eq("organisation_id", input.organisationId)
      .maybeSingle();
    if (!acct) {
      return {
        error: "Ad account does not belong to this business." as const,
      };
    }
  }

  // Early feedback only: the binding check runs again at execution time
  // (claim_advertising_action) against the settings in force then.
  if (
    (input.actionType === "CREATE_CAMPAIGN" || input.actionType === "UPDATE_CAMPAIGN") &&
    settings.daily_spend_limit_cents > 0
  ) {
    const key =
      settings.limit_period === "daily" ? "dailyBudgetCents" : "lifetimeBudgetCents";
    const raw = input.payload[key];
    const budget = raw != null ? Number(raw) : null;
    if (budget != null && (!Number.isFinite(budget) || budget < 0)) {
      return { error: "Budget must be a positive amount." as const };
    }
    if (budget != null && budget > settings.daily_spend_limit_cents) {
      return {
        error: `The ${settings.limit_period} budget exceeds this business's limit of ${settings.daily_spend_limit_cents} (minor units).` as const,
      };
    }
    if (input.actionType === "CREATE_CAMPAIGN" && budget == null) {
      return {
        error: `This business limits ${settings.limit_period} spend: set a ${settings.limit_period} budget.` as const,
      };
    }
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("advertising_actions")
    .insert({
      organisation_id: input.organisationId,
      meta_ad_account_id: input.metaAdAccountId || null,
      action_type: input.actionType,
      status: "proposed",
      proposed_by: input.proposedBy || "user",
      proposed_by_user_id: input.userId,
      payload: input.payload as Json,
    })
    .select("id, action_type, status, payload, created_at")
    .single();

  if (error) return { error: error.message as string };

  await createAdminClient().from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: input.userId,
    action: "ads.action_proposed",
    entity_type: "advertising_actions",
    entity_id: data.id,
    metadata: {
      action_type: input.actionType,
      proposed_by: input.proposedBy || "user",
    },
  });

  return { success: true as const, action: data };
}

export async function rejectAdvertisingAction(input: {
  organisationId: string;
  userId: string;
  actionId: string;
}) {
  const membership = await assertOrgMembership(
    input.organisationId,
    input.userId,
    true
  );
  if ("error" in membership) return membership;

  const db = createAdminClient();
  const { data, error } = await db
    .from("advertising_actions")
    .update({ status: "rejected" })
    .eq("id", input.actionId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "proposed")
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Action not found or not pending approval" };

  await createAdminClient().from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: input.userId,
    action: "ads.action_rejected",
    entity_type: "advertising_actions",
    entity_id: input.actionId,
    metadata: {},
  });

  return { success: true as const };
}

type ClaimResult =
  | { ok: true; action: Tables<"advertising_actions"> }
  | { ok: false; code: string; error: string; status?: string };

/**
 * Approve and run one advertising action.
 *
 * The decision is made in the database (claim_advertising_action): under a
 * per-business lock it re-reads the CURRENT settings, validates the full
 * resulting campaign state (active-campaign cap, per-campaign or
 * business-wide budget for the configured period, counting other actions
 * already executing) and claims the action (-> executing). Only the request
 * that gets the claimed row back calls Meta, so a double click or two
 * approvers can never execute it twice, and a limit lowered after the
 * proposal is applied.
 */
export async function approveAndExecuteAdvertisingAction(input: {
  organisationId: string;
  userId: string;
  actionId: string;
}) {
  const membership = await assertOrgMembership(
    input.organisationId,
    input.userId,
    true
  );
  if ("error" in membership) return membership;

  const db = createAdminClient();
  // Business check before the claim (the RPC itself is business-agnostic).
  const { data: owned } = await db
    .from("advertising_actions")
    .select("id")
    .eq("id", input.actionId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();
  if (!owned) return { error: "Action not found for this business" };

  await ensureAdvertisingSettings(input.organisationId);
  const { data: claimData, error: claimError } = await db.rpc(
    "claim_advertising_action",
    { p_action_id: input.actionId, p_actor_user_id: input.userId }
  );
  if (claimError) {
    console.error("claim_advertising_action failed", claimError.message);
    return { error: "Could not start this advertising action. Try again." };
  }
  const claim = claimData as unknown as ClaimResult;
  if (!claim?.ok) {
    if (claim?.code && claim.code !== "NOT_CLAIMABLE") {
      await db.from("audit_logs").insert({
        organisation_id: input.organisationId,
        user_id: input.userId,
        action: "ads.action_refused",
        entity_type: "advertising_actions",
        entity_id: input.actionId,
        metadata: { code: claim.code, error: claim.error },
      });
    }
    return {
      error: claim?.error || "This advertising action cannot run now.",
      code: claim?.code,
    };
  }
  const action = claim.action;

  const settings = await ensureAdvertisingSettings(input.organisationId);
  const isMutating = MUTATING_ACTIONS.includes(
    action.action_type as AdvertisingActionType
  );

  try {
    const result = await executeAdvertisingAction({
      organisationId: input.organisationId,
      actionType: action.action_type as AdvertisingActionType,
      payload: (action.payload || {}) as Record<string, unknown>,
      metaAdAccountId: action.meta_ad_account_id as string | null,
      settings,
      isMutating,
    });

    const { error: doneError } = await db
      .from("advertising_actions")
      .update({
        status: "succeeded",
        result: result as Json,
        external_ids: (result.externalIds || {}) as Json,
        error_message: null,
      })
      .eq("id", action.id)
      .eq("status", "executing");
    if (doneError) {
      console.error("advertising action result not recorded", action.id, doneError.message);
    }

    await db.from("audit_logs").insert({
      organisation_id: input.organisationId,
      user_id: input.userId,
      action: "ads.action_executed",
      entity_type: "advertising_actions",
      entity_id: action.id,
      metadata: {
        action_type: action.action_type,
        external_ids: result.externalIds || {},
      },
    });

    return { success: true as const, result };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db
      .from("advertising_actions")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("id", action.id)
      .eq("status", "executing");

    await db.from("audit_logs").insert({
      organisation_id: input.organisationId,
      user_id: input.userId,
      action: "ads.action_failed",
      entity_type: "advertising_actions",
      entity_id: action.id,
      metadata: { error: message, action_type: action.action_type },
    });

    return { error: message };
  }
}

async function executeAdvertisingAction(input: {
  organisationId: string;
  actionType: AdvertisingActionType;
  payload: Record<string, unknown>;
  metaAdAccountId: string | null;
  settings: AdvertisingSettings;
  isMutating: boolean;
}) {
  if (!(await metaAdsAdapter.isConfiguredForOrg(input.organisationId))) {
    throw new Error("No Meta app is configured for this business.");
  }

  const tokenRes = await loadOrgMetaUserToken(input.organisationId);
  if ("error" in tokenRes) throw new Error(tokenRes.error);
  const { token, hasAdsScopes } = tokenRes;

  const db = createAdminClient();

  switch (input.actionType) {
    case "DISCOVER_AD_ACCOUNTS": {
      if (!hasAdsScopes) {
        throw new Error(
          "Facebook connection is missing ads_read/ads_management. Reconnect Facebook to grant ads permissions."
        );
      }
      const accounts = await metaAdsAdapter.listAdAccounts(token);
      return { accounts, externalIds: {} };
    }
    case "LINK_AD_ACCOUNT": {
      if (!hasAdsScopes) {
        throw new Error(
          "Facebook connection is missing ads permissions. Reconnect Facebook."
        );
      }
      const externalId = String(input.payload.externalAdAccountId || "");
      if (!externalId) throw new Error("externalAdAccountId is required");
      const info = await metaAdsAdapter.getAdAccount(token, externalId);
      const { data: row, error } = await db
        .from("meta_ad_accounts")
        .upsert(
          {
            organisation_id: input.organisationId,
            external_ad_account_id: info.externalAdAccountId,
            name: info.name,
            currency: info.currency,
            timezone_name: info.timezoneName,
            account_status: info.accountStatus,
            status: "connected",
            connected_at: new Date().toISOString(),
            disconnected_at: null,
            last_error: null,
            metadata: (info.raw || {}) as Json,
          },
          { onConflict: "organisation_id,external_ad_account_id" }
        )
        .select("id, external_ad_account_id")
        .single();
      if (error) throw new Error(error.message);
      return {
        adAccount: row,
        externalIds: { ad_account_id: info.externalAdAccountId },
      };
    }
    case "GET_AD_ACCOUNT": {
      const acct = await requireOrgAdAccount(
        input.organisationId,
        input.metaAdAccountId || String(input.payload.metaAdAccountId || "")
      );
      const info = await metaAdsAdapter.getAdAccount(
        token,
        acct.external_ad_account_id
      );
      return { adAccount: info, externalIds: { ad_account_id: info.externalAdAccountId } };
    }
    case "LIST_CAMPAIGNS": {
      const acct = await requireOrgAdAccount(
        input.organisationId,
        input.metaAdAccountId || String(input.payload.metaAdAccountId || "")
      );
      const campaigns = await metaAdsAdapter.listCampaigns(
        token,
        acct.external_ad_account_id
      );
      for (const c of campaigns) {
        await db.from("meta_ad_campaigns").upsert(
          {
            organisation_id: input.organisationId,
            meta_ad_account_id: acct.id,
            external_campaign_id: c.externalCampaignId,
            name: c.name,
            objective: c.objective,
            status: c.status,
            effective_status: c.effectiveStatus,
            daily_budget_cents: c.dailyBudgetCents,
            lifetime_budget_cents: c.lifetimeBudgetCents,
            metadata: (c.raw || {}) as Json,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "organisation_id,external_campaign_id" }
        );
      }
      return { campaigns, externalIds: {} };
    }
    case "GET_CAMPAIGN_INSIGHTS": {
      const campaignId = String(input.payload.externalCampaignId || "");
      if (!campaignId) throw new Error("externalCampaignId is required");
      await assertCampaignBelongsToOrg(input.organisationId, campaignId);
      const insights = await metaAdsAdapter.getCampaignInsights(
        token,
        campaignId
      );
      return {
        insights,
        externalIds: { campaign_id: campaignId },
      };
    }
    case "CREATE_CAMPAIGN": {
      // Spend limit, budget type and active-campaign cap were validated by
      // claim_advertising_action against the current settings.
      const acct = await requireOrgAdAccount(
        input.organisationId,
        input.metaAdAccountId || String(input.payload.metaAdAccountId || "")
      );

      const created = await metaAdsAdapter.createCampaign(
        token,
        acct.external_ad_account_id,
        {
          name: String(input.payload.name || "Untitled campaign"),
          objective: String(input.payload.objective || "OUTCOME_TRAFFIC"),
          status: (input.payload.status as "PAUSED" | "ACTIVE") || "PAUSED",
          dailyBudgetCents:
            input.payload.dailyBudgetCents != null
              ? Number(input.payload.dailyBudgetCents)
              : null,
          lifetimeBudgetCents:
            input.payload.lifetimeBudgetCents != null
              ? Number(input.payload.lifetimeBudgetCents)
              : null,
          specialAdCategories: Array.isArray(input.payload.specialAdCategories)
            ? (input.payload.specialAdCategories as string[])
            : [],
        }
      );

      await db.from("meta_ad_campaigns").upsert(
        {
          organisation_id: input.organisationId,
          meta_ad_account_id: acct.id,
          external_campaign_id: created.externalCampaignId,
          name: created.name,
          objective: created.objective,
          status: created.status,
          effective_status: created.effectiveStatus,
          daily_budget_cents: created.dailyBudgetCents,
          lifetime_budget_cents: created.lifetimeBudgetCents,
          last_synced_at: new Date().toISOString(),
        },
        { onConflict: "organisation_id,external_campaign_id" }
      );

      return {
        campaign: created,
        externalIds: { campaign_id: created.externalCampaignId },
      };
    }
    case "PAUSE_CAMPAIGN":
    case "ENABLE_CAMPAIGN": {
      const campaignId = String(input.payload.externalCampaignId || "");
      if (!campaignId) throw new Error("externalCampaignId is required");
      await assertCampaignBelongsToOrg(input.organisationId, campaignId);
      const status =
        input.actionType === "PAUSE_CAMPAIGN" ? "PAUSED" : "ACTIVE";
      const updated = await metaAdsAdapter.updateCampaignStatus(
        token,
        campaignId,
        status
      );
      await db
        .from("meta_ad_campaigns")
        .update({
          status: updated.status,
          effective_status: updated.status,
          last_synced_at: new Date().toISOString(),
        })
        .eq("organisation_id", input.organisationId)
        .eq("external_campaign_id", campaignId);
      return {
        campaign: updated,
        externalIds: { campaign_id: campaignId },
      };
    }
    case "UPDATE_CAMPAIGN": {
      const campaignId = String(input.payload.externalCampaignId || "");
      if (!campaignId) throw new Error("externalCampaignId is required");
      await assertCampaignBelongsToOrg(input.organisationId, campaignId);
      // Budget vs limit validated by claim_advertising_action.
      const dailyBudgetCents =
        input.payload.dailyBudgetCents != null
          ? Number(input.payload.dailyBudgetCents)
          : undefined;
      const lifetimeBudgetCents =
        input.payload.lifetimeBudgetCents != null
          ? Number(input.payload.lifetimeBudgetCents)
          : undefined;
      const status = input.payload.status as "PAUSED" | "ACTIVE" | undefined;
      const updated = await metaAdsAdapter.updateCampaign(token, campaignId, {
        name: input.payload.name ? String(input.payload.name) : undefined,
        dailyBudgetCents,
        lifetimeBudgetCents,
        status,
      });
      // Keep the cache (which the limit checks read) in step with Meta.
      const cachePatch: {
        last_synced_at: string;
        daily_budget_cents?: number;
        lifetime_budget_cents?: number;
        status?: string;
        effective_status?: string;
        name?: string;
      } = { last_synced_at: new Date().toISOString() };
      if (dailyBudgetCents !== undefined) cachePatch.daily_budget_cents = dailyBudgetCents;
      if (lifetimeBudgetCents !== undefined) cachePatch.lifetime_budget_cents = lifetimeBudgetCents;
      if (status) {
        cachePatch.status = status;
        cachePatch.effective_status = status;
      }
      if (input.payload.name) cachePatch.name = String(input.payload.name);
      await db
        .from("meta_ad_campaigns")
        .update(cachePatch)
        .eq("organisation_id", input.organisationId)
        .eq("external_campaign_id", campaignId);
      return {
        campaign: updated,
        externalIds: { campaign_id: campaignId },
      };
    }
    default:
      throw new Error(`Unsupported advertising action: ${input.actionType}`);
  }
}

async function requireOrgAdAccount(
  organisationId: string,
  metaAdAccountId: string
) {
  if (!metaAdAccountId) throw new Error("metaAdAccountId is required");
  const db = createAdminClient();
  const { data } = await db
    .from("meta_ad_accounts")
    .select("id, external_ad_account_id, organisation_id")
    .eq("id", metaAdAccountId)
    .eq("organisation_id", organisationId)
    .maybeSingle();
  if (!data) {
    throw new Error("Ad account does not belong to this business.");
  }
  return data;
}

async function assertCampaignBelongsToOrg(
  organisationId: string,
  externalCampaignId: string
) {
  const db = createAdminClient();
  const { data } = await db
    .from("meta_ad_campaigns")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("external_campaign_id", externalCampaignId)
    .maybeSingle();
  if (!data) {
    // Allow first-time sync via LIST then insights — still block unknown IDs
    throw new Error(
      "Campaign is not associated with this business. Sync campaigns first."
    );
  }
}

export async function updateAdvertisingSettings(input: {
  organisationId: string;
  userId: string;
  dailySpendLimitCents?: number;
  maxActiveCampaigns?: number;
  mode?: "off" | "approval";
  emergencyStopped?: boolean;
  limitScope?: AdLimitScope;
  limitPeriod?: AdLimitPeriod;
}) {
  const membership = await assertOrgMembership(
    input.organisationId,
    input.userId,
    true
  );
  if ("error" in membership) return membership;

  await ensureAdvertisingSettings(input.organisationId);
  const patch: {
    daily_spend_limit_cents?: number;
    max_active_campaigns?: number;
    mode?: string;
    emergency_stopped?: boolean;
    limit_scope?: AdLimitScope;
    limit_period?: AdLimitPeriod;
  } = {};
  if (input.limitScope != null) {
    if (input.limitScope !== "per_campaign" && input.limitScope !== "business_total") {
      return { error: "Unknown limit scope" };
    }
    patch.limit_scope = input.limitScope;
  }
  if (input.limitPeriod != null) {
    if (input.limitPeriod !== "daily" && input.limitPeriod !== "lifetime") {
      return { error: "Unknown limit period" };
    }
    patch.limit_period = input.limitPeriod;
  }
  if (input.dailySpendLimitCents != null) {
    if (!Number.isFinite(input.dailySpendLimitCents)) return { error: "Invalid spend limit" };
    patch.daily_spend_limit_cents = Math.max(0, Math.round(input.dailySpendLimitCents));
  }
  if (input.maxActiveCampaigns != null) {
    if (!Number.isFinite(input.maxActiveCampaigns)) return { error: "Invalid campaign limit" };
    patch.max_active_campaigns = Math.max(0, Math.round(input.maxActiveCampaigns));
  }
  if (input.mode) {
    // Never allow enabling autopilot ads from settings
    patch.mode = input.mode === "approval" ? "approval" : "off";
  }
  if (input.emergencyStopped != null) {
    patch.emergency_stopped = input.emergencyStopped;
  }

  const db = createAdminClient();
  const { data, error } = await db
    .from("advertising_settings")
    .update(patch)
    .eq("organisation_id", input.organisationId)
    .select("*")
    .single();
  if (error) return { error: error.message };

  await createAdminClient().from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: input.userId,
    action: "ads.settings_updated",
    entity_type: "advertising_settings",
    entity_id: input.organisationId,
    metadata: patch as Json,
  });

  return { success: true as const, settings: toAdvertisingSettings(data) };
}
