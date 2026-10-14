/**
 * PR 1: membership / role rules, exercised both through the Data API with
 * real user sessions (what an attacker would do) and through the server
 * actions the UI uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  actAs,
  admin,
  createUser,
  makePlatformAdmin,
  membership,
  teamOrg,
} from "../helpers.ts";

const onboarding = () => import("../../../src/app/(app)/app/actions/onboarding");
const social = () => import("../../../src/app/(app)/app/actions/social");
const automation = () => import("../../../src/app/(app)/app/actions/automation");

test("roles: create_organisation makes the creator the single owner", async () => {
  const { orgId, owner } = await teamOrg("own");
  assert.equal((await membership(orgId, owner.id))?.role, "owner");
});

test("roles: manager cannot self-promote to owner via the Data API", async () => {
  const { orgId, manager } = await teamOrg("selfpromo");
  const { data, error } = await manager.client
    .from("organisation_members")
    .update({ role: "owner" })
    .eq("organisation_id", orgId)
    .eq("user_id", manager.id)
    .select("id");
  assert.ok(error || !data?.length, "update must not apply");
  assert.equal((await membership(orgId, manager.id))?.role, "manager");
});

test("roles: staff cannot self-promote via the Data API", async () => {
  const { orgId, staff } = await teamOrg("staffpromo");
  const { data, error } = await staff.client
    .from("organisation_members")
    .update({ role: "manager" })
    .eq("organisation_id", orgId)
    .eq("user_id", staff.id)
    .select("id");
  assert.ok(error || !data?.length);
  assert.equal((await membership(orgId, staff.id))?.role, "staff");
});

test("roles: manager cannot add members, demote or remove the owner", async () => {
  const { orgId, manager, owner } = await teamOrg("mgrwrites");
  const outsider = await createUser("outsider");
  const ins = await manager.client
    .from("organisation_members")
    .insert({ organisation_id: orgId, user_id: outsider.id, role: "staff" });
  assert.ok(ins.error, "manager insert must fail");

  const del = await manager.client
    .from("organisation_members")
    .delete()
    .eq("organisation_id", orgId)
    .eq("user_id", owner.id)
    .select("id");
  assert.ok(del.error || !del.data?.length);
  assert.equal((await membership(orgId, owner.id))?.role, "owner");
});

test("roles: owner cannot add a second owner (insert or promote)", async () => {
  const { orgId, owner, manager } = await teamOrg("secondowner");
  const outsider = await createUser("outsider2");
  const ins = await owner.client
    .from("organisation_members")
    .insert({ organisation_id: orgId, user_id: outsider.id, role: "owner" });
  assert.ok(ins.error);
  assert.match(ins.error!.message, /transfer_ownership/);

  const up = await owner.client
    .from("organisation_members")
    .update({ role: "owner" })
    .eq("organisation_id", orgId)
    .eq("user_id", manager.id)
    .select("id");
  assert.ok(up.error);
  assert.equal((await membership(orgId, manager.id))?.role, "manager");

  // Service role is held to the same rule.
  const svc = await admin
    .from("organisation_members")
    .update({ role: "owner" })
    .eq("organisation_id", orgId)
    .eq("user_id", manager.id);
  assert.ok(svc.error);
});

test("roles: the last owner cannot be demoted or removed", async () => {
  const { orgId, owner } = await teamOrg("lastowner");
  const demote = await owner.client
    .from("organisation_members")
    .update({ role: "manager" })
    .eq("organisation_id", orgId)
    .eq("user_id", owner.id);
  assert.ok(demote.error);

  const remove = await owner.client
    .from("organisation_members")
    .delete()
    .eq("organisation_id", orgId)
    .eq("user_id", owner.id);
  assert.ok(remove.error);

  const svcRemove = await admin
    .from("organisation_members")
    .delete()
    .eq("organisation_id", orgId)
    .eq("user_id", owner.id);
  assert.ok(svcRemove.error);
  assert.equal((await membership(orgId, owner.id))?.role, "owner");
});

test("roles: server actions refuse owner grants and self changes", async () => {
  const { orgId, owner, manager, staff } = await teamOrg("actions");
  const { updateMemberRole, inviteTeamMember, removeTeamMember } =
    await onboarding();
  const mgr = await membership(orgId, manager.id);
  const own = await membership(orgId, owner.id);

  actAs(owner);
  const grant = await updateMemberRole({
    organisationId: orgId,
    membershipId: mgr!.id,
    role: "owner",
  });
  assert.ok("error" in grant && grant.error);
  const self = await updateMemberRole({
    organisationId: orgId,
    membershipId: own!.id,
    role: "manager",
  });
  assert.ok("error" in self && self.error);
  const inviteOwner = await inviteTeamMember({
    organisationId: orgId,
    email: "someone@itest.local",
    role: "owner",
  });
  assert.ok("error" in inviteOwner && inviteOwner.error);

  // Valid owner action still works.
  const ok = await updateMemberRole({
    organisationId: orgId,
    membershipId: mgr!.id,
    role: "staff",
  });
  assert.deepEqual(ok, { success: true });

  // A manager cannot use the actions to remove people.
  actAs(manager);
  const st = await membership(orgId, staff.id);
  const rm = await removeTeamMember({
    organisationId: orgId,
    membershipId: st!.id,
  });
  assert.ok("error" in rm && rm.error);
  actAs(null);
});

test("roles: transfer_ownership — manager refused, owner succeeds atomically", async () => {
  const { orgId, owner, manager, staff } = await teamOrg("transfer");
  const byManager = await manager.client.rpc("transfer_ownership", {
    p_organisation_id: orgId,
    p_new_owner_user_id: manager.id,
  });
  assert.ok(byManager.error);

  const { transferOwnership } = await onboarding();
  actAs(owner);
  const st = await membership(orgId, staff.id);
  const res = await transferOwnership({
    organisationId: orgId,
    membershipId: st!.id,
  });
  actAs(null);
  assert.deepEqual(res, { success: true });
  assert.equal((await membership(orgId, staff.id))?.role, "owner");
  assert.equal((await membership(orgId, owner.id))?.role, "manager");

  const { data: owners } = await admin
    .from("organisation_members")
    .select("user_id")
    .eq("organisation_id", orgId)
    .eq("role", "owner");
  assert.equal(owners?.length, 1);

  const { data: audit } = await admin
    .from("audit_logs")
    .select("metadata")
    .eq("organisation_id", orgId)
    .eq("action", "organisation.ownership_transferred");
  assert.equal(audit?.length, 1);
});

test("roles: deleting a business still cascades its owner row", async () => {
  const { orgId, owner } = await teamOrg("cascade");
  const { error } = await owner.client
    .from("organisations")
    .delete()
    .eq("id", orgId);
  assert.equal(error, null);
  assert.equal(await membership(orgId, owner.id), null);
});

const AUTOPILOT_REFUSED = /Autopilot mode is not available yet/;

async function seedSettings(orgId: string) {
  const a = await admin
    .from("automation_settings")
    .insert({ organisation_id: orgId, mode: "manual" });
  assert.equal(a.error, null, a.error?.message);
  const b = await admin.from("advertising_settings").insert({ organisation_id: orgId });
  assert.equal(b.error, null, b.error?.message);
}

test("settings: staff cannot write; manager CAN write the same columns", async () => {
  const { orgId, staff, manager } = await teamOrg("staffsettings");
  await seedSettings(orgId);

  const a = await staff.client
    .from("automation_settings")
    .update({ posts_per_week: 9 })
    .eq("organisation_id", orgId)
    .select("organisation_id");
  assert.equal(a.error, null);
  assert.equal(a.data?.length, 0, "staff update must match zero rows (RLS)");

  const b = await staff.client
    .from("advertising_settings")
    .update({ daily_spend_limit_cents: 99999 })
    .eq("organisation_id", orgId)
    .select("organisation_id");
  assert.equal(b.error, null);
  assert.equal(b.data?.length, 0, "staff ads update must match zero rows (RLS)");

  const c = await staff.client
    .from("organisations")
    .update({ autopilot_mode: "approval_required" })
    .eq("id", orgId)
    .select("id");
  assert.equal(c.error, null);
  assert.equal(c.data?.length, 0);

  // Positive control: the same writes succeed for a manager, so the staff
  // result above is RLS, not a missing grant or table.
  const ma = await manager.client
    .from("automation_settings")
    .update({ posts_per_week: 9 })
    .eq("organisation_id", orgId)
    .select("posts_per_week");
  assert.equal(ma.error, null, ma.error?.message);
  assert.deepEqual(ma.data, [{ posts_per_week: 9 }]);
  const mb = await manager.client
    .from("advertising_settings")
    .update({ daily_spend_limit_cents: 12345 })
    .eq("organisation_id", orgId)
    .select("daily_spend_limit_cents");
  assert.equal(mb.error, null, mb.error?.message);
  assert.deepEqual(mb.data, [{ daily_spend_limit_cents: 12345 }]);

  actAs(staff);
  const { updateAutopilotMode } = await social();
  const viaAction = await updateAutopilotMode({
    organisationId: orgId,
    mode: "approval_required",
  });
  actAs(null);
  assert.ok("error" in viaAction && viaAction.error);
});

test("settings: autopilot is refused by the trigger for owner, manager and service role", async () => {
  const { orgId, owner, manager } = await teamOrg("autopilot");
  await seedSettings(orgId);

  for (const user of [owner, manager]) {
    const o = await user.client
      .from("organisations")
      .update({ autopilot_mode: "autopilot" })
      .eq("id", orgId);
    assert.match(o.error?.message ?? "", AUTOPILOT_REFUSED);
    const s = await user.client
      .from("automation_settings")
      .update({ mode: "autopilot" })
      .eq("organisation_id", orgId);
    assert.match(s.error?.message ?? "", AUTOPILOT_REFUSED);
    const ad = await user.client
      .from("advertising_settings")
      .update({ mode: "autopilot" })
      .eq("organisation_id", orgId);
    assert.match(ad.error?.message ?? "", AUTOPILOT_REFUSED);
  }
  const svc = await admin
    .from("automation_settings")
    .update({ mode: "autopilot" })
    .eq("organisation_id", orgId);
  assert.match(svc.error?.message ?? "", AUTOPILOT_REFUSED);

  const { updateAutopilotMode } = await social();
  const { saveAutomationSettings } = await automation();
  actAs(manager);
  const viaSocial = await updateAutopilotMode({
    organisationId: orgId,
    mode: "autopilot",
  });
  assert.ok("error" in viaSocial && viaSocial.error);
  const viaAutomation = await saveAutomationSettings({
    organisationId: orgId,
    mode: "autopilot",
  });
  assert.ok("error" in viaAutomation && viaAutomation.error);

  // Manager may still switch to approval mode; a paused business stays paused.
  await admin
    .from("automation_settings")
    .update({ paused: true })
    .eq("organisation_id", orgId);
  const ok = await updateAutopilotMode({
    organisationId: orgId,
    mode: "approval_required",
  });
  actAs(null);
  assert.deepEqual(ok, { success: true });
  const { data: org } = await admin
    .from("organisations")
    .select("autopilot_mode")
    .eq("id", orgId)
    .single();
  assert.equal(org?.autopilot_mode, "approval_required");
  const { data: settings } = await admin
    .from("automation_settings")
    .select("mode, paused")
    .eq("organisation_id", orgId)
    .single();
  assert.deepEqual(settings, { mode: "approval", paused: true });
});

test("roles: platform admin can run transfer_ownership (recovery path)", async () => {
  const { orgId, owner, manager } = await teamOrg("adminxfer");
  const padmin = await createUser("padmin");
  await makePlatformAdmin(padmin.id);
  const { error } = await padmin.client.rpc("transfer_ownership", {
    p_organisation_id: orgId,
    p_new_owner_user_id: manager.id,
  });
  assert.equal(error, null, error?.message);
  assert.equal((await membership(orgId, manager.id))?.role, "owner");
  assert.equal((await membership(orgId, owner.id))?.role, "manager");
});

test("roles: service role cannot insert a second owner", async () => {
  const { orgId } = await teamOrg("svcowner");
  const outsider = await createUser("svc-outsider");
  const { error } = await admin
    .from("organisation_members")
    .insert({ organisation_id: orgId, user_id: outsider.id, role: "owner" });
  assert.match(error?.message ?? "", /already has an owner/);
});

test("roles: deleting the auth user who owns a business is blocked", async () => {
  const { orgId, owner } = await teamOrg("deluser");
  const { error } = await admin.auth.admin.deleteUser(owner.id);
  assert.ok(error, "deleting the owner's auth user must fail");
  assert.equal((await membership(orgId, owner.id))?.role, "owner");
  const { data } = await admin.auth.admin.getUserById(owner.id);
  assert.equal(data.user?.id, owner.id, "auth user must still exist");
});

