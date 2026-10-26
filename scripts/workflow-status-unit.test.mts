/**
 * Workflow status map states derived from overview figures (no database).
 *   npm run test:unit
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { workflowStatus, type WorkflowInput } from "../src/lib/dashboard/workflow-status.ts";

const healthy: WorkflowInput = {
  brandLogo: true,
  accounts: { total: 2, issues: 0 },
  automation: { enabled: true, mode: "supervised", paused: false },
  totals: { draft: 1, review: 0, approved: 0, scheduled: 2, publishing: 0, published: 4, failed: 0 },
  heldCount: 0,
  publications: 3,
};

const stateOf = (input: WorkflowInput, id: string) =>
  workflowStatus(input).nodes.find((node) => node.id === id)?.state;

test("a fully working business is all green", () => {
  const status = workflowStatus(healthy);
  assert.deepEqual(status.nodes.map((node) => node.state), ["ok", "ok", "ok", "ok", "ok", "ok"]);
  assert.equal(status.attention, 0);
  assert.deepEqual(status.summary, { state: "ok", label: "All systems running" });
});

test("a new business with nothing set up is grey, except the missing brand logo", () => {
  const status = workflowStatus({
    brandLogo: false,
    accounts: { total: 0, issues: 0 },
    automation: null,
    totals: {},
    heldCount: 0,
    publications: 0,
  });
  assert.deepEqual(status.nodes.map((node) => node.state), [
    "attention", "idle", "idle", "idle", "idle", "idle",
  ]);
  assert.equal(status.attention, 1);
  assert.deepEqual(status.summary, { state: "attention", label: "1 step needs attention" });
});

test("a brand logo alone does not claim the system is running", () => {
  const status = workflowStatus({ ...healthy, accounts: { total: 0, issues: 0 }, automation: null, totals: {}, heldCount: 0, publications: 0 });
  assert.equal(status.nodes[0].state, "ok");
  assert.deepEqual(status.summary, { state: "idle", label: "Nothing running yet" });
});

test("failed content turns the engine red and links to the failures", () => {
  const status = workflowStatus({ ...healthy, totals: { ...healthy.totals, failed: 2 } });
  const engine = status.nodes.find((node) => node.id === "engine");
  assert.equal(engine?.state, "attention");
  assert.equal(engine?.detail, "2 failed");
  assert.equal(engine?.href, "/app/content?status=failed");
  assert.deepEqual(status.summary, { state: "attention", label: "1 step needs attention" });
});

test("social accounts that need reconnecting turn red", () => {
  assert.equal(stateOf({ ...healthy, accounts: { total: 3, issues: 2 } }, "accounts"), "attention");
  assert.equal(workflowStatus({ ...healthy, accounts: { total: 3, issues: 2 } }).nodes[1].detail, "2 need attention");
});

test("no accounts is grey rather than red", () => {
  assert.equal(stateOf({ ...healthy, accounts: { total: 0, issues: 0 } }, "accounts"), "idle");
});

test("paused automation is red, and automation that is off is grey", () => {
  assert.equal(stateOf({ ...healthy, automation: { enabled: true, mode: "supervised", paused: true } }, "automation"), "attention");
  assert.equal(stateOf({ ...healthy, automation: { enabled: false, mode: "supervised", paused: false } }, "automation"), "idle");
  assert.equal(stateOf({ ...healthy, automation: { enabled: true, mode: "off", paused: false } }, "automation"), "idle");
});

test("held publishing jobs turn publishing red", () => {
  const status = workflowStatus({ ...healthy, heldCount: 3 });
  assert.equal(status.nodes.find((node) => node.id === "publishing")?.state, "attention");
  assert.equal(status.nodes.find((node) => node.id === "publishing")?.detail, "3 on hold");
});

test("unavailable holds data is grey, not green", () => {
  assert.equal(stateOf({ ...healthy, heldCount: null }, "publishing"), "idle");
});

test("results are grey until a post is confirmed", () => {
  assert.equal(stateOf({ ...healthy, publications: 0 }, "results"), "idle");
  assert.equal(stateOf(healthy, "results"), "ok");
});

test("several red steps are counted in the summary", () => {
  const status = workflowStatus({ ...healthy, brandLogo: false, heldCount: 1 });
  assert.equal(status.attention, 2);
  assert.equal(status.summary.label, "2 steps need attention");
});
