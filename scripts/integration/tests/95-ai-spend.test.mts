/**
 * AI spending limits (audit finding 10): per-business monthly budget, daily
 * image cap, per-user concurrency, stale reservations, business-timezone
 * periods, and the automation engine skipping an over-budget business.
 *
 * OpenAI is the integration mock (scripts/integration/mocks/ai-openai.ts):
 * itest.aiCalls records every call that reached the "provider".
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { actAs, admin, createOrg, createUser, teamOrg } from "../helpers.ts";
import { itest, resetProviders } from "../state.ts";

const flyerRoute = () => import("../../../src/app/api/ai/flyer/route");
const generateRoute = () => import("../../../src/app/api/ai/generate/route");
const spend = () => import("../../../src/lib/ai/spend");
const limitsAction = () => import("../../../src/app/(app)/app/actions/ai-limits");
const engine = () => import("../../../src/lib/automation/engine");

const BRIEF = JSON.stringify({
  headline: "Autumn offer",
  subheadline: "20% off cuts this week",
  cta: "Book now",
  visual_direction: "Clean salon interior",
  style_notes: "Calm, premium",
  colour_guidance: "Brand colours",
  image_prompt: "A clean premium flyer for a salon autumn offer",
  use_uploaded_media: false,
  reference_media_ids: [],
});

type User = Awaited<ReturnType<typeof createUser>>;

async function call(
  route: () => Promise<{ POST: (r: Request) => Promise<Response> }>,
  user: User,
  body: Record<string, unknown>
) {
  const { POST } = await route();
  actAs(user);
  try {
    const res = await POST(
      new Request("http://localhost:3000/api/ai/x", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    );
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  } finally {
    actAs(null);
  }
}

async function usage(orgId: string) {
  const { data, error } = await admin
    .from("ai_usage")
    .select("*")
    .eq("organisation_id", orgId)
    .order("created_at", { ascending: true });
  assert.equal(error, null, error?.message);
  return data as Array<Record<string, unknown>>;
}

/** Fixture spend, written by the service role (as the server would). */
async function seedSpend(
  orgId: string,
  rows: Array<{
    pence: number;
    images?: number;
    status?: "committed" | "reserved" | "released";
    at?: string;
    userId?: string | null;
  }>
) {
  const { error } = await admin.from("ai_usage").insert(
    rows.map((r) => ({
      organisation_id: orgId,
      user_id: r.userId ?? null,
      task: "fixture",
      provider: "openai",
      model: r.images ? "gpt-image-2.5-sunburst" : "gpt-5-mini",
      image_count: r.images ?? 0,
      estimated_cost_pence: r.pence,
      status: r.status ?? "committed",
      created_at: r.at ?? new Date().toISOString(),
    }))
  );
  assert.equal(error, null, error?.message);
}

async function setLimits(orgId: string, budgetPence: number, imageCap = 20) {
  const { error } = await admin.from("ai_settings").upsert({
    organisation_id: orgId,
    monthly_budget_pence: budgetPence,
    daily_image_cap: imageCap,
  });
  assert.equal(error, null, error?.message);
}

async function totals(orgId: string, at: string) {
  const { data, error } = await admin.rpc("ai_spend_totals", {
    p_organisation_id: orgId,
    p_at: at,
  });
  assert.equal(error, null, error?.message);
  return data as Record<string, unknown>;
}

test("ai spend: a flyer under budget succeeds and commits text + image usage", async () => {
  resetProviders();
  const { orgId, staff } = await teamOrg("aispend-ok");
  itest.aiText = () => ({ text: BRIEF, inputTokens: 2000, outputTokens: 1000 });

  const res = await call(flyerRoute, staff, { organisation_id: orgId, notes: "Autumn offer" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(
    itest.aiCalls.map((c) => c.kind),
    ["text", "image"]
  );

  const rows = await usage(orgId);
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => r.status === "committed"), JSON.stringify(rows));
  const text = rows.find((r) => r.image_count === 0)!;
  const image = rows.find((r) => r.image_count === 1)!;
  assert.equal(text.model, "gpt-5-mini");
  assert.equal(text.user_id, staff.id);
  assert.equal(text.task, "flyer");
  assert.equal(text.input_tokens, 2000);
  assert.equal(text.output_tokens, 1000);
  // actual = 2 * 0.025 + 1 * 0.2 = 0.25p, far below the 3.3p+ reservation
  assert.equal(Number(text.actual_cost_pence), 0.25);
  assert.ok(Number(text.estimated_cost_pence) > 3);
  assert.equal(image.model, "gpt-image-2.5-sunburst");
  assert.equal(Number(image.estimated_cost_pence) >= 25, true);
  assert.equal(text.request_id, image.request_id, "one request id per HTTP request");
  resetProviders();
});

test("ai spend: a call that would exceed the £50 budget is refused before the provider", async () => {
  resetProviders();
  const { orgId, owner } = await teamOrg("aispend-over");
  await seedSpend(orgId, [{ pence: 4999 }]);
  itest.aiText = () => ({ text: BRIEF });

  const flyer = await call(flyerRoute, owner, { organisation_id: orgId });
  assert.equal(flyer.status, 429);
  assert.equal(flyer.body.code, "AI_BUDGET_EXCEEDED");
  assert.match(String(flyer.body.error), /AI budget/);
  const text = await call(generateRoute, owner, { organisation_id: orgId, notes: "hi" });
  assert.equal(text.status, 429);
  assert.equal(text.body.code, "AI_BUDGET_EXCEEDED");
  assert.equal(itest.aiCalls.length, 0, "the provider must not be called");
  assert.equal((await usage(orgId)).length, 1, "nothing reserved");

  // Room for the brief (~3.4p) but not for the image (25p+): the image is
  // refused before the image model is called.
  const { orgId: org2, owner: owner2 } = await teamOrg("aispend-img-over");
  await seedSpend(org2, [{ pence: 4980 }]);
  const partial = await call(flyerRoute, owner2, { organisation_id: org2 });
  assert.equal(partial.status, 429);
  assert.equal(partial.body.code, "AI_BUDGET_EXCEEDED");
  assert.deepEqual(
    itest.aiCalls.map((c) => c.kind),
    ["text"]
  );
  resetProviders();
});

test("ai spend: the 21st AI image of the day is refused", async () => {
  resetProviders();
  const { orgId, manager } = await teamOrg("aispend-cap");
  await seedSpend(orgId, [{ pence: 500, images: 20 }]);
  itest.aiText = () => ({ text: BRIEF });

  const res = await call(flyerRoute, manager, { organisation_id: orgId });
  assert.equal(res.status, 429);
  assert.equal(res.body.code, "AI_DAILY_IMAGE_CAP");
  assert.match(String(res.body.error), /20 of its 20 AI images/);
  assert.equal(
    itest.aiCalls.filter((c) => c.kind === "image").length,
    0,
    "image model not called"
  );

  // Raising the cap lets the next one through.
  await setLimits(orgId, 5000, 21);
  const ok = await call(flyerRoute, manager, { organisation_id: orgId });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  resetProviders();
});

test("ai spend: concurrent reservations near the limit cannot overshoot", async () => {
  resetProviders();
  const owner = await createUser("aispend-race");
  const orgId = await createOrg(owner, "aispend-race");
  await seedSpend(orgId, [{ pence: 4900 }]);

  // 10 parallel 30p reservations against 100p of headroom: exactly 3 fit.
  const results = await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      admin.rpc("reserve_ai_spend", {
        p_organisation_id: orgId,
        p_user_id: null as unknown as string,
        p_task: "race",
        p_provider: "openai",
        p_model: "gpt-5-mini",
        p_estimated_pence: 30,
        p_image_count: 0,
        p_request_id: crypto.randomUUID(),
        p_attempt: 1,
        p_max_inflight_per_user: 2,
      }).then((r) => ({ i, ...r }))
    )
  );
  for (const r of results) assert.equal(r.error, null, r.error?.message);
  const ok = results.filter((r) => (r.data as { ok: boolean }).ok);
  assert.equal(ok.length, 3, JSON.stringify(results.map((r) => r.data)));
  for (const r of results.filter((x) => !(x.data as { ok: boolean }).ok)) {
    assert.equal((r.data as { code: string }).code, "AI_BUDGET_EXCEEDED");
  }
  const t = await totals(orgId, new Date().toISOString());
  assert.ok(Number(t.month_spend_pence) <= 5000, JSON.stringify(t));

  // Same through the guard for images: cap 20 with 18 used, 5 parallel
  // image calls (slow provider) -> exactly 2 reach the image model.
  const orgImg = await createOrg(owner, "aispend-race-img");
  await seedSpend(orgImg, [{ pence: 100, images: 18 }]);
  itest.aiDelayMs = 150;
  const { runWithAiSpend, guardedGenerateImage } = await spend();
  const { openai } = await import("@ai-sdk/openai");
  const outcomes = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      runWithAiSpend({ task: "race", organisationId: orgImg }, () =>
        guardedGenerateImage({ model: openai.image("gpt-image-2.5-sunburst"), prompt: "x" })
      )
    )
  );
  const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
  assert.equal(fulfilled.length, 2);
  for (const o of outcomes) {
    if (o.status === "rejected") {
      assert.equal((o.reason as { code?: string }).code, "AI_DAILY_IMAGE_CAP");
    }
  }
  assert.equal(itest.aiCalls.filter((c) => c.kind === "image").length, 2);
  resetProviders();
});

test("ai spend: a failed provider call releases its reservation; retries are each reserved", async () => {
  resetProviders();
  const { orgId, owner } = await teamOrg("aispend-fail");
  const { runWithAiSpend, guardedGenerateText } = await spend();
  const { openai } = await import("@ai-sdk/openai");

  itest.aiFail = { status: 500, retryable: false };
  await assert.rejects(
    runWithAiSpend({ task: "t", organisationId: orgId, userId: owner.id }, () =>
      guardedGenerateText({ model: openai("gpt-5-mini"), prompt: "hello" })
    )
  );
  let rows = await usage(orgId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, "released");
  assert.equal(rows[0].error_code, "http_500");

  // Retryable failure: one retry, one reservation per attempt, both released.
  itest.aiFail = { status: 503, retryable: true };
  await assert.rejects(
    runWithAiSpend({ task: "t", organisationId: orgId, userId: owner.id }, () =>
      guardedGenerateText({ model: openai("gpt-5-mini"), prompt: "hello" })
    )
  );
  rows = await usage(orgId);
  assert.equal(rows.length, 3);
  assert.deepEqual(
    rows.slice(1).map((r) => [r.attempt, r.status]),
    [
      [1, "released"],
      [2, "released"],
    ]
  );
  assert.equal(itest.aiCalls.length, 3);

  // Through a route, a provider failure still falls back to demo content
  // (as before) and leaves no spend held.
  itest.aiFail = { status: 500, retryable: false };
  const res = await call(generateRoute, owner, { organisation_id: orgId, notes: "x" });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.demo, true);
  const t = await totals(orgId, new Date().toISOString());
  assert.equal(Number(t.month_spend_pence), 0);
  resetProviders();
});

test("ai spend: stale reservations stop counting; fresh ones block", async () => {
  resetProviders();
  const owner = await createUser("aispend-stale");
  const orgId = await createOrg(owner, "aispend-stale");
  const twentyMinAgo = new Date(Date.now() - 20 * 60_000).toISOString();
  await seedSpend(orgId, [{ pence: 4990, status: "reserved", at: twentyMinAgo }]);

  const reserve = () =>
    admin.rpc("reserve_ai_spend", {
      p_organisation_id: orgId,
      p_user_id: owner.id,
      p_task: "stale",
      p_provider: "openai",
      p_model: "gpt-5-mini",
      p_estimated_pence: 50,
      p_image_count: 0,
      p_request_id: crypto.randomUUID(),
      p_attempt: 1,
      p_max_inflight_per_user: 2,
    });

  const first = await reserve();
  assert.equal((first.data as { ok: boolean }).ok, true, JSON.stringify(first.data));
  const stale = (await usage(orgId)).find((r) => r.created_at && r.task === "fixture")!;
  assert.equal(stale.status, "released");
  assert.equal(stale.error_code, "stale");

  // A fresh (1 minute old) reservation still holds its estimate.
  const org2 = await createOrg(owner, "aispend-fresh");
  await seedSpend(org2, [
    { pence: 4990, status: "reserved", at: new Date(Date.now() - 60_000).toISOString() },
  ]);
  const blocked = await admin.rpc("reserve_ai_spend", {
    p_organisation_id: org2,
    p_user_id: null as unknown as string,
    p_task: "fresh",
    p_provider: "openai",
    p_model: "gpt-5-mini",
    p_estimated_pence: 50,
    p_image_count: 0,
    p_request_id: crypto.randomUUID(),
    p_attempt: 1,
    p_max_inflight_per_user: 2,
  });
  assert.equal((blocked.data as { code: string }).code, "AI_BUDGET_EXCEEDED");
});

test("ai spend: at most 2 paid calls in flight per user", async () => {
  resetProviders();
  const { orgId, staff } = await teamOrg("aispend-conc");
  const now = new Date(Date.now() - 30_000).toISOString();
  await seedSpend(orgId, [
    { pence: 5, status: "reserved", at: now, userId: staff.id },
    { pence: 5, status: "reserved", at: now, userId: staff.id },
  ]);
  const res = await call(generateRoute, staff, { organisation_id: orgId, notes: "x" });
  assert.equal(res.status, 429);
  assert.equal(res.body.code, "AI_CONCURRENCY_LIMIT");
  assert.equal(itest.aiCalls.length, 0);
});

test("ai spend: input bounds and fail-closed guards", async () => {
  resetProviders();
  const { orgId, owner } = await teamOrg("aispend-bounds");
  const long = await call(flyerRoute, owner, { organisation_id: orgId, notes: "x".repeat(4001) });
  assert.equal(long.status, 413);
  assert.equal(long.body.code, "AI_INPUT_TOO_LARGE");
  const many = await call(generateRoute, owner, { organisation_id: orgId, count: 50 });
  assert.equal(many.status, 413);
  assert.equal(itest.aiCalls.length, 0);

  const { guardedGenerateText, guardedGenerateImage, runWithAiSpend } = await spend();
  const { openai } = await import("@ai-sdk/openai");
  // No business attached -> refused, provider untouched.
  await assert.rejects(
    guardedGenerateText({ model: openai("gpt-5-mini"), prompt: "x" }),
    (e: { code?: string }) => e.code === "AI_SPEND_CONTEXT_MISSING"
  );
  // A model with no price is refused.
  await assert.rejects(
    runWithAiSpend({ task: "t", organisationId: orgId }, () =>
      guardedGenerateText({ model: openai("gpt-unpriced"), prompt: "x" })
    ),
    (e: { code?: string }) => e.code === "AI_MODEL_NOT_PRICED"
  );
  // More than 2 reference images is refused.
  await assert.rejects(
    runWithAiSpend({ task: "t", organisationId: orgId }, () =>
      guardedGenerateImage({
        model: openai.image("gpt-image-2.5-sunburst"),
        prompt: { text: "x", images: ["a", "b", "c"] },
      })
    ),
    (e: { code?: string }) => e.code === "AI_INPUT_TOO_LARGE"
  );
  assert.equal(itest.aiCalls.length, 0);
});

test("ai spend: month and day follow the business timezone (UK midnight, 25 Oct 2026)", async () => {
  const owner = await createUser("aispend-tz");
  const london = await createOrg(owner, "aispend-tz-london");
  const utc = await createOrg(owner, "aispend-tz-utc");
  const { error } = await admin.from("organisations").update({ timezone: "UTC" }).eq("id", utc);
  assert.equal(error, null, error?.message);

  const rows = [
    // 23:30 BST 30 Sep (September in London) / 22:30 UTC 30 Sep
    { pence: 1, at: "2026-09-30T22:30:00Z" },
    // 00:30 BST 1 Oct (October in London) / 23:30 UTC 30 Sep (September in UTC)
    { pence: 10, at: "2026-09-30T23:30:00Z" },
    // 23:30 BST 20 Oct (the 20th in London)
    { pence: 0, images: 1, at: "2026-10-20T22:30:00Z" },
    // 00:10 BST 21 Oct (the 21st in London; still the 20th in UTC)
    { pence: 0, images: 2, at: "2026-10-20T23:10:00Z" },
    // 23:30 BST 24 Oct (the 24th in London)
    { pence: 0, images: 4, at: "2026-10-24T22:30:00Z" },
    // 00:30 BST 25 Oct (the 25th in London — clocks go back at 01:00 UTC)
    { pence: 0, images: 8, at: "2026-10-24T23:30:00Z" },
    // 23:30 GMT 25 Oct (still the 25th: that day is 25 hours long)
    { pence: 0, images: 16, at: "2026-10-25T23:30:00Z" },
    // 00:10 GMT 26 Oct
    { pence: 0, images: 32, at: "2026-10-26T00:10:00Z" },
  ];
  await seedSpend(london, rows);
  await seedSpend(utc, rows);

  // Month: 1 Oct in London starts at 23:00 UTC on 30 Sep.
  const oct = await totals(london, "2026-10-10T12:00:00Z");
  assert.equal(new Date(String(oct.month_start)).toISOString(), "2026-09-30T23:00:00.000Z");
  assert.equal(Number(oct.month_spend_pence), 10);
  const octUtc = await totals(utc, "2026-10-10T12:00:00Z");
  assert.equal(Number(octUtc.month_spend_pence), 0);
  const sep = await totals(london, "2026-09-30T22:45:00Z");
  assert.equal(Number(sep.month_spend_pence), 1);

  // UK midnight: 00:30 BST on the 21st counts only the 00:10 BST image.
  const d21 = await totals(london, "2026-10-20T23:30:00Z");
  assert.equal(new Date(String(d21.day_start)).toISOString(), "2026-10-20T23:00:00.000Z");
  assert.equal(Number(d21.images_today), 2);
  const d20Utc = await totals(utc, "2026-10-20T23:30:00Z");
  assert.equal(Number(d20Utc.images_today), 3);

  // Clock change: the 25th runs 23:00 UTC 24 Oct -> 00:00 UTC 26 Oct.
  const d25 = await totals(london, "2026-10-25T23:30:00Z");
  assert.equal(new Date(String(d25.day_start)).toISOString(), "2026-10-24T23:00:00.000Z");
  assert.equal(Number(d25.images_today), 8 + 16);
  const d26 = await totals(london, "2026-10-26T00:30:00Z");
  assert.equal(new Date(String(d26.day_start)).toISOString(), "2026-10-26T00:00:00.000Z");
  assert.equal(Number(d26.images_today), 32);
  // November starts at midnight GMT (= UTC) after the change.
  const nov = await totals(london, "2026-11-01T00:30:00Z");
  assert.equal(new Date(String(nov.month_start)).toISOString(), "2026-11-01T00:00:00.000Z");
});

test("ai spend: staff cannot change the budget; owner and manager can", async () => {
  const { orgId, owner, manager, staff } = await teamOrg("aispend-roles");
  const { updateAiLimits } = await limitsAction();

  actAs(staff);
  const denied = await updateAiLimits({
    organisationId: orgId,
    monthlyBudgetPence: 100_000,
    dailyImageCap: 500,
  });
  actAs(null);
  assert.ok("error" in denied && denied.error, JSON.stringify(denied));

  // Direct writes from the staff member's browser session are refused too.
  const ins = await staff.client
    .from("ai_settings")
    .insert({ organisation_id: orgId, monthly_budget_pence: 100_000 });
  assert.notEqual(ins.error, null, "staff insert must fail");

  actAs(manager);
  const okManager = await updateAiLimits({
    organisationId: orgId,
    monthlyBudgetPence: 7_500,
    dailyImageCap: 30,
  });
  actAs(null);
  assert.deepEqual(okManager, { success: true });

  const upd = await staff.client
    .from("ai_settings")
    .update({ monthly_budget_pence: 100_000 })
    .eq("organisation_id", orgId)
    .select("organisation_id");
  assert.ok(upd.error || (upd.data ?? []).length === 0, "staff update must not apply");

  actAs(owner);
  const okOwner = await updateAiLimits({
    organisationId: orgId,
    monthlyBudgetPence: 5_000,
    dailyImageCap: 20,
  });
  actAs(null);
  assert.deepEqual(okOwner, { success: true });

  const { data } = await admin
    .from("ai_settings")
    .select("monthly_budget_pence, daily_image_cap, updated_by")
    .eq("organisation_id", orgId)
    .single();
  assert.deepEqual(data, { monthly_budget_pence: 5000, daily_image_cap: 20, updated_by: owner.id });

  // Staff can read the summary.
  const summary = await staff.client.rpc("ai_spend_summary", { p_organisation_id: orgId });
  assert.equal(summary.error, null, summary.error?.message);
  assert.equal((summary.data as { monthly_budget_pence: number }).monthly_budget_pence, 5000);
});

test("ai spend: browser sessions cannot write the ledger or call the spend RPCs", async () => {
  const { orgId, owner } = await teamOrg("aispend-rls");
  const other = await teamOrg("aispend-rls-other");
  await seedSpend(orgId, [{ pence: 10 }]);
  await seedSpend(other.orgId, [{ pence: 10 }]);

  const ins = await owner.client.from("ai_usage").insert({
    organisation_id: orgId,
    task: "x",
    provider: "openai",
    model: "gpt-5-mini",
    estimated_cost_pence: 0,
    status: "committed",
  });
  assert.notEqual(ins.error, null, "insert must be refused");

  const upd = await owner.client
    .from("ai_usage")
    .update({ status: "released" })
    .eq("organisation_id", orgId)
    .select("id");
  assert.ok(upd.error || (upd.data ?? []).length === 0, "update must not apply");
  const del = await owner.client.from("ai_usage").delete().eq("organisation_id", orgId).select("id");
  assert.ok(del.error || (del.data ?? []).length === 0, "delete must not apply");
  const still = await usage(orgId);
  assert.equal(still.length, 1);
  assert.equal(still[0].status, "committed");

  // Members read their own business's rows only.
  const own = await owner.client.from("ai_usage").select("id").eq("organisation_id", orgId);
  assert.equal(own.data?.length, 1);
  const foreign = await owner.client.from("ai_usage").select("id").eq("organisation_id", other.orgId);
  assert.equal(foreign.data?.length ?? 0, 0);

  for (const [fn, args] of [
    [
      "reserve_ai_spend",
      {
        p_organisation_id: orgId,
        p_user_id: owner.id,
        p_task: "x",
        p_provider: "openai",
        p_model: "gpt-5-mini",
        p_estimated_pence: 0,
        p_image_count: 0,
        p_request_id: crypto.randomUUID(),
        p_attempt: 1,
        p_max_inflight_per_user: 2,
      },
    ],
    ["commit_ai_spend", { p_usage_id: still[0].id, p_actual_pence: 0, p_input_tokens: 0, p_output_tokens: 0 }],
    ["release_ai_spend", { p_usage_id: still[0].id }],
    ["ai_spend_totals", { p_organisation_id: orgId }],
  ] as const) {
    const r = await owner.client.rpc(fn as never, args as never);
    assert.notEqual(r.error, null, `${fn} must be refused for a browser session`);
  }
  const foreignSummary = await owner.client.rpc("ai_spend_summary", {
    p_organisation_id: other.orgId,
  });
  assert.notEqual(foreignSummary.error, null, "another business's summary is refused");
});

test("ai spend: automation skips an over-budget business, records it, and runs the others", async () => {
  resetProviders();
  const over = await teamOrg("aispend-auto-over");
  const fine = await teamOrg("aispend-auto-ok");
  await seedSpend(over.orgId, [{ pence: 5000 }]);

  for (const org of [over.orgId, fine.orgId]) {
    const { error } = await admin.from("automation_settings").upsert(
      {
        organisation_id: org,
        enabled: true,
        paused: false,
        mode: "approval",
        quiet_hours: {},
        last_run_at: null,
      },
      { onConflict: "organisation_id" }
    );
    assert.equal(error, null, error?.message);
  }
  // Only these two are due, so the batch takes both.
  const { error: notDue } = await admin
    .from("automation_settings")
    .update({ last_run_at: new Date().toISOString() })
    .not("organisation_id", "in", `(${over.orgId},${fine.orgId})`);
  assert.equal(notDue, null, notDue?.message);

  const before = (await usage(over.orgId)).length;
  const { runAutomationForAllEnabled } = await engine();
  const result = await runAutomationForAllEnabled();
  const byOrg = new Map(
    result.results.map((r) => [(r as { organisationId: string }).organisationId, r])
  );

  const skipped = byOrg.get(over.orgId) as Record<string, unknown>;
  assert.equal(skipped.skipped, true, JSON.stringify(skipped));
  assert.equal(skipped.code, "AI_BUDGET_EXCEEDED");
  assert.equal((await usage(over.orgId)).length, before, "no AI reserved for the skipped business");
  const { data: activity } = await admin
    .from("automation_activity")
    .select("event_type, metadata")
    .eq("organisation_id", over.orgId)
    .eq("event_type", "ai_budget_skipped");
  assert.equal(activity?.length, 1);

  const ran = byOrg.get(fine.orgId) as Record<string, unknown>;
  assert.ok(ran && !ran.skipped && ran.runId, JSON.stringify(ran));
  assert.ok(itest.aiCalls.length > 0, "the other business reached the (mock) provider");
  const fineRows = await usage(fine.orgId);
  assert.ok(fineRows.length > 0);
  assert.ok(fineRows.every((r) => r.task === "automation" && r.status === "released"));
  resetProviders();
});

test("ai spend: no app code calls the AI SDK's paid functions around the guard", async () => {
  const { readdirSync, readFileSync, statSync } = await import("node:fs");
  const { join, sep } = await import("node:path");
  const root = join(import.meta.dirname, "../../../src");
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !p.split(sep).join("/").includes("/lib/ai/spend/")) {
        const src = readFileSync(p, "utf8");
        const fromAi = src.match(/import\s*\{([^}]*)\}\s*from\s*"ai"/g) ?? [];
        if (
          fromAi.some((m) =>
            /\b(generateText|generateImage|generateObject|streamText|streamObject|embed|embedMany|experimental_\w+)\b/.test(m)
          )
        ) {
          offenders.push(p);
        }
      }
    }
  };
  walk(root);
  assert.deepEqual(offenders, [], "use guardedGenerateText / guardedGenerateImage from @/lib/ai/spend");
});
