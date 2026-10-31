import assert from "node:assert/strict";
import { test } from "node:test";
import { Director } from "../src/components/studio/scene/director";
import { INNER_DOOR, LAYOUT, ROUTES, WALLS, type V2 } from "../src/components/studio/scene/layout";
import { DemoSimulator } from "../src/lib/studio/demo";
import { getStudioSnapshot } from "../src/lib/studio/snapshot";
import { isValidTransition } from "../src/lib/studio/stations";
import type { StationId, StudioEvent, StudioSnapshot } from "../src/lib/studio/types";
import { deriveEvents, deriveStations, unavailableStations } from "../src/lib/studio/workflow";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const iso = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();

function snapshot(over: Partial<StudioSnapshot> = {}): StudioSnapshot {
  return {
    organisationId: "business-A",
    businessName: "Business A",
    fetchedAt: iso(0),
    demo: false,
    timezone: "Europe/London",
    counts: { draft: 0, review: 0, approved: 0, scheduled: 0, publishing: 0, published: 0, failed: 0 },
    content: [],
    tasks: [],
    publishing: { scheduled: 0, nextScheduledAt: null, held: 0, confirmed: [] },
    setup: { hasLogo: true, mediaCount: 4, activeCampaigns: [], connectionIssues: 0, accounts: 1 },
    analytics: { enquiries7d: 0, enquiries2d: 0, reach7d: 0, lastMetricDate: null, lastUpdatedAt: null },
    ...over,
  };
}

// ── Workflow state mapping ────────────────────────────────────────────────

test("scheduled work is shown as scheduled, never as published", () => {
  const s = deriveStations(
    snapshot({
      counts: { draft: 0, review: 0, approved: 0, scheduled: 2, publishing: 0, published: 0, failed: 0 },
      publishing: { scheduled: 2, nextScheduledAt: iso(-600), held: 0, confirmed: [] },
    }),
    NOW,
  );
  assert.equal(s.publishing.mood, "scheduled");
  assert.match(s.publishing.statusLabel, /not yet published/);
  assert.notEqual(s.publishing.mood, "done");
});

test("success only follows a provider confirmation", () => {
  const unconfirmed = deriveStations(
    snapshot({ counts: { draft: 0, review: 0, approved: 0, scheduled: 0, publishing: 0, published: 3, failed: 0 } }),
    NOW,
  );
  assert.equal(unconfirmed.publishing.mood, "idle");
  const confirmed = deriveStations(
    snapshot({ publishing: { scheduled: 0, nextScheduledAt: null, held: 0, confirmed: [{ id: "p1", contentId: "c1", platform: "instagram", publishedAt: iso(30) }] } }),
    NOW,
  );
  assert.equal(confirmed.publishing.mood, "done");
});

test("queued, awaiting approval, processing, failed and empty states map truthfully", () => {
  const s = deriveStations(
    snapshot({
      counts: { draft: 2, review: 1, approved: 0, scheduled: 0, publishing: 1, published: 0, failed: 1 },
      content: [
        { id: "r", title: "Needs approval", status: "review", updatedAt: iso(60), scheduledAt: null },
        { id: "f", title: "Broken post", status: "failed", updatedAt: iso(5), scheduledAt: null },
      ],
      tasks: [{ id: "t", type: "content_generation", status: "running", createdAt: iso(1) }],
    }),
    NOW,
  );
  assert.equal(s.content.mood, "working");
  assert.equal(s.content.queue, 2);
  assert.equal(s.review.mood, "waiting");
  assert.equal(s.review.taskTitle, "Needs approval");
  assert.equal(s.publishing.mood, "blocked");
  assert.equal(s.publishing.taskTitle, "Broken post");
  const empty = deriveStations(snapshot(), NOW);
  for (const station of Object.values(empty)) assert.ok(["idle"].includes(station.mood), station.id);
});

test("unavailable data is unknown, not zero", () => {
  for (const station of Object.values(unavailableStations())) {
    assert.equal(station.unknown, true);
    assert.equal(station.mood, "idle");
  }
});

// ── Events between snapshots ──────────────────────────────────────────────

const draft = { id: "c1", title: "Offer reel", status: "draft" as const, updatedAt: iso(10), scheduledAt: null };

test("the first snapshot is a baseline and identical snapshots produce nothing", () => {
  const a = snapshot({ content: [draft] });
  assert.deepEqual(deriveEvents(null, a), []);
  assert.deepEqual(deriveEvents(a, { ...a, fetchedAt: iso(-1) }), []);
});

test("workflow moves become valid handovers, including the revision path", () => {
  const a = snapshot({ fetchedAt: iso(5), content: [{ ...draft, status: "review" }] });
  const forward = deriveEvents(snapshot({ fetchedAt: iso(9), content: [draft] }), { ...a, content: [{ ...draft, status: "review", updatedAt: iso(6) }] });
  assert.deepEqual(forward.map((e) => [e.kind, e.from, e.to]), [["handover", "content", "review"]]);
  const back = deriveEvents(a, snapshot({ content: [{ ...draft, status: "draft", updatedAt: iso(1) }] }));
  assert.deepEqual(back.map((e) => [e.kind, e.from, e.to]), [["revision", "review", "content"]]);
  const approve = deriveEvents(a, snapshot({ content: [{ ...draft, status: "scheduled", updatedAt: iso(1) }] }));
  assert.deepEqual(approve.map((e) => [e.from, e.to]), [["review", "publishing"]]);
  for (const e of [...forward, ...back, ...approve]) assert.ok(isValidTransition(e.from, e.to));
});

test("event keys are stable, so re-deriving never creates a second handover", () => {
  const a = snapshot({ fetchedAt: iso(5), content: [draft] });
  const b = snapshot({ content: [{ ...draft, status: "review", updatedAt: iso(2) }] });
  assert.deepEqual(deriveEvents(a, b).map((e) => e.key), deriveEvents(a, b).map((e) => e.key));
});

test("completion comes only from new provider confirmations", () => {
  const a = snapshot({ fetchedAt: iso(5), content: [{ ...draft, status: "publishing" }] });
  const silent = deriveEvents(a, snapshot({ content: [{ ...draft, status: "published", updatedAt: iso(1) }] }));
  assert.deepEqual(silent, []);
  const confirmed = deriveEvents(
    a,
    snapshot({
      content: [{ ...draft, status: "published", updatedAt: iso(1) }],
      publishing: { scheduled: 0, nextScheduledAt: null, held: 0, confirmed: [{ id: "pub-1", contentId: "c1", platform: "facebook", publishedAt: iso(1) }] },
    }),
  );
  assert.deepEqual(confirmed.map((e) => [e.kind, e.from, e.to, e.key]), [["complete", "publishing", "analytics", "publication:pub-1"]]);
});

test("switching business never carries events across", () => {
  const a = snapshot({ fetchedAt: iso(5), content: [draft] });
  const b = snapshot({ organisationId: "business-B", content: [{ ...draft, status: "review", updatedAt: iso(1) }] });
  assert.deepEqual(deriveEvents(a, b), []);
  const demo = new DemoSimulator(NOW).snapshot();
  assert.deepEqual(deriveEvents(a, demo), []);
  assert.notEqual(demo.organisationId, a.organisationId);
  assert.ok(demo.content.every((c) => c.title.startsWith("Demo ·")));
});

// ── Data adapter scope ────────────────────────────────────────────────────

test("every studio query is scoped to the selected business", async () => {
  const calls: Array<{ table: string; filters: unknown[][] }> = [];
  const db = {
    from(table: string) {
      const call = { table, filters: [] as unknown[][] };
      const query: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit", "single", "maybeSingle", "range"]) query[m] = () => query;
      for (const m of ["eq", "in", "not", "gte", "lte", "lt"])
        query[m] = (...args: unknown[]) => {
          call.filters.push([m, ...args]);
          return query;
        };
      query.then = (resolve: (v: unknown) => void) => {
        calls.push(call);
        const data = table === "organisations" ? { name: "A", timezone: "Europe/London" } : table === "brand_profiles" ? null : [];
        resolve({ data, count: 2, error: null });
      };
      return query;
    },
  };
  const result = await getStudioSnapshot(db as never, "business-A");
  assert.equal(result.organisationId, "business-A");
  assert.equal(result.demo, false);
  assert.ok(calls.length > 10);
  for (const call of calls)
    assert.ok(
      call.filters.some((f) => f[0] === "eq" && f[1] === (call.table === "organisations" ? "id" : "organisation_id") && f[2] === "business-A"),
      `${call.table} lacks business scope`,
    );
});

// ── Choreography ──────────────────────────────────────────────────────────

const DESK_HALF: V2 = [0.75, 0.35];

function insideDesk(x: number, z: number, margin: number) {
  return Object.values(LAYOUT).some(
    (l) => Math.abs(x - l.origin[0]) < DESK_HALF[0] + margin && Math.abs(z - l.origin[1]) < DESK_HALF[1] + margin,
  );
}

function segmentsCross(a: V2, b: V2, c: V2, d: V2) {
  const o = (p: V2, q: V2, r: V2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

test("walking routes never cross a wall or a desk", () => {
  for (const [key, path] of Object.entries(ROUTES)) {
    for (let i = 0; i < path.length - 1; i++) {
      for (const wall of WALLS) assert.ok(!segmentsCross(path[i], path[i + 1], wall.from, wall.to), `${key} crosses a wall`);
      for (let k = 0; k <= 20; k++) {
        const x = path[i][0] + ((path[i + 1][0] - path[i][0]) * k) / 20;
        const z = path[i][1] + ((path[i + 1][1] - path[i][1]) * k) / 20;
        assert.ok(!insideDesk(x, z, 0.1), `${key} passes through a desk at ${x.toFixed(2)},${z.toFixed(2)}`);
      }
    }
  }
  assert.ok(ROUTES["review>content"].some((p) => p === INNER_DOOR), "revision uses its own doorway");
});

function event(from: StationId, to: StationId, kind: StudioEvent["kind"] = "handover", key = `${from}>${to}`): StudioEvent {
  return { key, kind, from, to, contentId: "c1", title: "Offer reel", at: iso(0) };
}

function run(director: Director, seconds: number, each?: () => void) {
  for (let t = 0; t < seconds; t += 1 / 30) {
    director.update(1 / 30);
    each?.();
  }
}

test("a handover walks the route, delivers to the receiving desk and returns to the seat", () => {
  const d = new Director();
  const sender = d.agents.content;
  const seat = LAYOUT.content.seat.pos;
  const pass = LAYOUT.review.pass.pos;
  let reachedPass = false;
  let delivered = false;
  let maxStep = 0;
  let last: V2 = [sender.x, sender.z];
  d.enqueue([event("content", "review")]);
  run(d, 40, () => {
    if (Math.hypot(sender.x - pass[0], sender.z - pass[1]) < 0.05) reachedPass = true;
    if (d.tokens.some((t) => t.active && t.flight)) delivered = true;
    maxStep = Math.max(maxStep, Math.hypot(sender.x - last[0], sender.z - last[1]));
    last = [sender.x, sender.z];
    if (sender.trip) assert.ok(!insideDesk(sender.x, sender.z, -0.02), "walked through a desk");
  });
  assert.ok(reachedPass, "sender reached the review desk");
  assert.ok(delivered, "the folder was handed over");
  assert.equal(sender.trip, null);
  assert.ok(Math.hypot(sender.x - seat[0], sender.z - seat[1]) < 0.05, "sender is back at the seat");
  assert.ok(maxStep < 0.1, `no teleporting (max step ${maxStep.toFixed(3)} m)`);
  assert.ok(d.tokens.every((t) => !t.active), "token cleared after delivery");
});

test("replayed or remounted events never trigger a second handover", () => {
  const d = new Director();
  const e = event("content", "review");
  d.enqueue([e]);
  run(d, 40);
  let trips = 0;
  d.enqueue([e, e]);
  run(d, 5, () => {
    if (d.agents.content.trip) trips++;
  });
  assert.equal(trips, 0);
  const remount = new Director();
  remount.ignore([e]);
  remount.enqueue([e]);
  run(remount, 2);
  assert.equal(remount.agents.content.trip, null);
});

test("the revision path returns work to the studio through the inner doorway", () => {
  const d = new Director();
  const reviewer = d.agents.review;
  let nearDoor = false;
  d.enqueue([event("review", "content", "revision")]);
  run(d, 30, () => {
    if (Math.hypot(reviewer.x - INNER_DOOR[0], reviewer.z - INNER_DOOR[1]) < 0.3) nearDoor = true;
  });
  assert.ok(nearDoor);
});

test("several handovers at once keep characters apart", () => {
  const d = new Director();
  d.enqueue([
    event("brief", "content", "handover", "a"),
    event("review", "publishing", "handover", "b"),
    event("publishing", "analytics", "complete", "c"),
    event("analytics", "brief", "handover", "d"),
    event("content", "review", "handover", "e"),
  ]);
  let closest = Infinity;
  run(d, 90, () => {
    const all = Object.values(d.agents);
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++)
        closest = Math.min(closest, Math.hypot(all[i].x - all[j].x, all[i].z - all[j].z));
  });
  assert.ok(closest > 0.28, `closest approach ${closest.toFixed(2)} m`);
  assert.ok(Object.values(d.agents).every((a) => a.trip === null), "all trips finished");
});

test("with animation off nobody walks and events only update counts", () => {
  const d = new Director();
  d.setAnimated(false);
  d.enqueue([event("content", "review")]);
  run(d, 5);
  for (const agent of Object.values(d.agents)) {
    const seat = LAYOUT[agent.id].seat.pos;
    assert.equal(agent.trip, null);
    assert.ok(Math.hypot(agent.x - seat[0], agent.z - seat[1]) < 1e-6);
  }
});
