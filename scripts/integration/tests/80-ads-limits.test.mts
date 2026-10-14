/**
 * PR 7: configurable ad limits enforced at execution time. The Meta Graph
 * API is the integration mock (itest.metaFetch); nothing leaves the machine.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { admin, connectAccount, teamOrg } from "../helpers.ts";
import { itest } from "../state.ts";

const ads = () => import("../../../src/lib/ads/service");

type Calls = { path: string }[];

/** Mock Graph: creating returns an id; anything else succeeds. */
function mockMeta(calls: Calls, delayMs = 0) {
  let n = 0;
  itest.metaFetch = async (path) => {
    calls.push({ path });
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    if (path.endsWith("/campaigns")) return { id: `cmp-${Date.now()}-${++n}` };
    return { success: true };
  };
}

async function adsBusiness(
  label: string,
  settings: {
    limit: number;
    maxActive?: number;
    scope?: "per_campaign" | "business_total";
    period?: "daily" | "lifetime";
    emergency?: boolean;
  },
  campaigns: Array<{ id: string; status: "ACTIVE" | "PAUSED"; daily?: number; lifetime?: number }> = []
) {
  const team = await teamOrg(label);
  await connectAccount(team.orgId, "facebook");
  const s = await admin.from("advertising_settings").upsert({
    organisation_id: team.orgId,
    mode: "approval",
    daily_spend_limit_cents: settings.limit,
    max_active_campaigns: settings.maxActive ?? 5,
    limit_scope: settings.scope ?? "per_campaign",
    limit_period: settings.period ?? "daily",
    emergency_stopped: settings.emergency ?? false,
  });
  assert.equal(s.error, null, s.error?.message);
  const { data: acct, error } = await admin
    .from("meta_ad_accounts")
    .insert({
      organisation_id: team.orgId,
      external_ad_account_id: `act_${label}`,
      status: "connected",
      currency: "GBP",
    })
    .select("id")
    .single();
  assert.equal(error, null, error?.message);
  for (const c of campaigns) {
    const r: { error: { message: string } | null } = await admin.from("meta_ad_campaigns").insert({
      organisation_id: team.orgId,
      meta_ad_account_id: acct!.id,
      external_campaign_id: `${label}-${c.id}`,
      status: c.status,
      effective_status: c.status,
      daily_budget_cents: c.daily ?? null,
      lifetime_budget_cents: c.lifetime ?? null,
    });
    assert.equal(r.error, null, r.error?.message);
  }
  return { ...team, adAccountId: acct!.id as string };
}

async function propose(
  b: { orgId: string; manager: { id: string }; adAccountId: string },
  actionType: string,
  payload: Record<string, unknown>
) {
  const { proposeAdvertisingAction } = await ads();
  const res = await proposeAdvertisingAction({
    organisationId: b.orgId,
    userId: b.manager.id,
    actionType: actionType as never,
    payload,
    metaAdAccountId: b.adAccountId,
  });
  assert.ok("success" in res && res.success, JSON.stringify(res));
  return res.action.id as string;
}

async function approve(b: { orgId: string; manager: { id: string } }, actionId: string) {
  const { approveAndExecuteAdvertisingAction } = await ads();
  return approveAndExecuteAdvertisingAction({
    organisationId: b.orgId,
    userId: b.manager.id,
    actionId,
  }) as Promise<{ success?: true; error?: string; code?: string }>;
}

async function actionStatus(id: string) {
  const { data } = await admin.from("advertising_actions").select("status").eq("id", id).single();
  return data?.status;
}

test("ads: two concurrent executions of one action make one Meta call", async () => {
  const b = await adsBusiness("adsdouble", { limit: 5000 });
  const id = await propose(b, "CREATE_CAMPAIGN", { name: "Spring", dailyBudgetCents: 1000 });
  const calls: Calls = [];
  mockMeta(calls, 300);
  const [x, y] = await Promise.all([approve(b, id), approve(b, id)]);
  itest.metaFetch = null;
  assert.equal(calls.filter((c) => c.path.endsWith("/campaigns")).length, 1, JSON.stringify(calls));
  const ok = [x, y].filter((r) => r.success);
  const refused = [x, y].filter((r) => r.error);
  assert.equal(ok.length, 1, JSON.stringify([x, y]));
  assert.equal(refused[0]?.code, "NOT_CLAIMABLE", JSON.stringify([x, y]));
  assert.equal(await actionStatus(id), "succeeded");
});

test("ads: a limit lowered after the proposal refuses execution", async () => {
  const b = await adsBusiness("adslowered", { limit: 5000 });
  const id = await propose(b, "CREATE_CAMPAIGN", { name: "Big", dailyBudgetCents: 4000 });
  const { updateAdvertisingSettings } = await ads();
  const upd = await updateAdvertisingSettings({
    organisationId: b.orgId,
    userId: b.manager.id,
    dailySpendLimitCents: 3000,
  });
  assert.ok("success" in upd && upd.success, JSON.stringify(upd));
  const calls: Calls = [];
  mockMeta(calls);
  const res = await approve(b, id);
  itest.metaFetch = null;
  assert.equal(res.code, "SPEND_LIMIT", JSON.stringify(res));
  assert.equal(calls.length, 0);
  assert.equal(await actionStatus(id), "proposed");
});

test("ads: ENABLE over the active-campaign cap is refused", async () => {
  const b = await adsBusiness("adscap", { limit: 5000, maxActive: 1 }, [
    { id: "a", status: "ACTIVE", daily: 1000 },
    { id: "b", status: "PAUSED", daily: 1000 },
  ]);
  const id = await propose(b, "ENABLE_CAMPAIGN", { externalCampaignId: "adscap-b" });
  const calls: Calls = [];
  mockMeta(calls);
  const res = await approve(b, id);
  // UPDATE setting ACTIVE is the same activation.
  const id2 = await propose(b, "UPDATE_CAMPAIGN", { externalCampaignId: "adscap-b", status: "ACTIVE" });
  const res2 = await approve(b, id2);
  itest.metaFetch = null;
  assert.equal(res.code, "ACTIVE_CAMPAIGN_LIMIT", JSON.stringify(res));
  assert.equal(res2.code, "ACTIVE_CAMPAIGN_LIMIT", JSON.stringify(res2));
  assert.equal(calls.length, 0);
});

test("ads: business_total overshoot across two campaigns is refused", async () => {
  const b = await adsBusiness("adstotal", { limit: 5000, scope: "business_total" }, [
    { id: "a", status: "ACTIVE", daily: 3000 },
    { id: "b", status: "PAUSED", daily: 3000 },
  ]);
  const calls: Calls = [];
  mockMeta(calls);
  const enable = await approve(b, await propose(b, "ENABLE_CAMPAIGN", { externalCampaignId: "adstotal-b" }));
  const create = await approve(
    b,
    await propose(b, "CREATE_CAMPAIGN", { name: "More", dailyBudgetCents: 2500, status: "ACTIVE" })
  );
  // Within the total: fine.
  const small = await approve(
    b,
    await propose(b, "CREATE_CAMPAIGN", { name: "Small", dailyBudgetCents: 1500, status: "ACTIVE" })
  );
  itest.metaFetch = null;
  assert.equal(enable.code, "SPEND_LIMIT", JSON.stringify(enable));
  assert.equal(create.code, "SPEND_LIMIT", JSON.stringify(create));
  assert.ok(small.success, JSON.stringify(small));
  assert.equal(calls.length, 1);
});

test("ads: two concurrent creates cannot overshoot the business total together", async () => {
  const b = await adsBusiness("adsrace", { limit: 5000, scope: "business_total" });
  const one = await propose(b, "CREATE_CAMPAIGN", { name: "One", dailyBudgetCents: 3000, status: "ACTIVE" });
  const two = await propose(b, "CREATE_CAMPAIGN", { name: "Two", dailyBudgetCents: 3000, status: "ACTIVE" });
  const calls: Calls = [];
  mockMeta(calls, 300);
  const results = await Promise.all([approve(b, one), approve(b, two)]);
  itest.metaFetch = null;
  assert.equal(results.filter((r) => r.success).length, 1, JSON.stringify(results));
  assert.equal(results.find((r) => r.error)?.code, "SPEND_LIMIT", JSON.stringify(results));
  assert.equal(calls.length, 1);
});

test("ads: the payload cannot be edited after the proposal", async () => {
  const b = await adsBusiness("adsfreeze", { limit: 5000 });
  const id = await propose(b, "CREATE_CAMPAIGN", { name: "Fixed", dailyBudgetCents: 1000 });
  const svc = await admin
    .from("advertising_actions")
    .update({ payload: { name: "Fixed", dailyBudgetCents: 999999 } })
    .eq("id", id);
  assert.equal(svc.error?.code, "42501", JSON.stringify(svc.error));
  // Browser sessions cannot write actions at all.
  const user = await b.manager.client
    .from("advertising_actions")
    .update({ payload: {} })
    .eq("id", id)
    .select("id");
  assert.ok(user.error || !user.data?.length, JSON.stringify(user));
  const { data } = await admin.from("advertising_actions").select("payload").eq("id", id).single();
  assert.deepEqual(data?.payload, { name: "Fixed", dailyBudgetCents: 1000 });
});

test("ads: emergency stop and a zero limit are hard stops (pausing still works)", async () => {
  const b = await adsBusiness("adsstop", { limit: 5000 }, [{ id: "a", status: "ACTIVE", daily: 1000 }]);
  const create = await propose(b, "CREATE_CAMPAIGN", { name: "Late", dailyBudgetCents: 1000 });
  const pause = await propose(b, "PAUSE_CAMPAIGN", { externalCampaignId: "adsstop-a" });
  await admin.from("advertising_settings").update({ emergency_stopped: true }).eq("organisation_id", b.orgId);
  const calls: Calls = [];
  mockMeta(calls);
  const stopped = await approve(b, create);
  const paused = await approve(b, pause);
  assert.equal(stopped.code, "EMERGENCY_STOP", JSON.stringify(stopped));
  assert.ok(paused.success, JSON.stringify(paused));

  await admin
    .from("advertising_settings")
    .update({ emergency_stopped: false, daily_spend_limit_cents: 0 })
    .eq("organisation_id", b.orgId);
  const zero = await approve(b, create);
  itest.metaFetch = null;
  assert.equal(zero.code, "NO_SPEND_LIMIT", JSON.stringify(zero));
  assert.equal(calls.length, 1); // the pause only
});

test("ads: lifetime period checks lifetime budgets and refuses a daily-only budget", async () => {
  const b = await adsBusiness("adslife", { limit: 100000, period: "lifetime" });
  const { proposeAdvertisingAction } = await ads();
  const noLifetime = await proposeAdvertisingAction({
    organisationId: b.orgId,
    userId: b.manager.id,
    actionType: "CREATE_CAMPAIGN",
    payload: { name: "Daily only", dailyBudgetCents: 1000 },
    metaAdAccountId: b.adAccountId,
  });
  assert.ok("error" in noLifetime, JSON.stringify(noLifetime));
  const calls: Calls = [];
  mockMeta(calls);
  const ok = await approve(
    b,
    await propose(b, "CREATE_CAMPAIGN", { name: "Season", lifetimeBudgetCents: 90000 })
  );
  const { data: c } = await admin
    .from("meta_ad_campaigns")
    .select("external_campaign_id")
    .eq("organisation_id", b.orgId)
    .eq("name", "Season")
    .single();
  // Proposed while the limit is 100000 ...
  const raiseId = await propose(b, "UPDATE_CAMPAIGN", {
    externalCampaignId: c!.external_campaign_id,
    lifetimeBudgetCents: 95000,
  });
  // ... then the limit drops to 50000.
  await admin.from("advertising_settings").update({ daily_spend_limit_cents: 50000 }).eq("organisation_id", b.orgId);
  const tooBig = await approve(
    b,
    await propose(b, "CREATE_CAMPAIGN", { name: "Season 2", lifetimeBudgetCents: 40000 })
  );
  const raise = await approve(b, raiseId);
  itest.metaFetch = null;
  assert.ok(ok.success, JSON.stringify(ok));
  assert.ok(tooBig.success, JSON.stringify(tooBig)); // per campaign: 40000 <= 50000
  assert.equal(raise.code, "SPEND_LIMIT", JSON.stringify(raise));
  assert.equal(calls.length, 2);
});
