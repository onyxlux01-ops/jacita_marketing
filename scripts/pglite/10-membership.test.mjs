import assert from "node:assert/strict";
import { test } from "node:test";
import { freshDb, asUser, newUser, rpcCreateOrg, makePlatformAdmin, fixtureQuery } from "./db.mjs";

const db = await freshDb();

async function setup() {
  const owner = await newUser(db, "owner");
  const manager = await newUser(db, "manager");
  const staff = await newUser(db, "staff");
  const org = await rpcCreateOrg(db, owner, "Org");
  await fixtureQuery(db,
    `insert into public.organisation_members (organisation_id, user_id, role) values ($1,$2,'manager'),($1,$3,'staff')`,
    [org, manager, staff]
  );
  return { owner, manager, staff, org };
}
const role = async (org, user) =>
  (
    await db.query(
      `select role from public.organisation_members where organisation_id=$1 and user_id=$2`,
      [org, user]
    )
  ).rows[0]?.role ?? null;

test("create_organisation still makes the creator the single owner", async () => {
  const { owner, org } = await setup();
  assert.equal(await role(org, owner), "owner");
});

test("manager cannot self-promote via the Data API", async () => {
  const { manager, org } = await setup();
  const r = await asUser(db, manager, () =>
    db.query(
      `update public.organisation_members set role='owner' where organisation_id=$1 and user_id=$2`,
      [org, manager]
    )
  );
  assert.equal(r.affectedRows, 0);
  assert.equal(await role(org, manager), "manager");
});

test("manager cannot change or remove others", async () => {
  const { manager, staff, owner, org } = await setup();
  const up = await asUser(db, manager, () =>
    db.query(`update public.organisation_members set role='manager' where organisation_id=$1 and user_id=$2`, [org, staff])
  );
  assert.equal(up.affectedRows, 0);
  const del = await asUser(db, manager, () =>
    db.query(`delete from public.organisation_members where organisation_id=$1 and user_id=$2`, [org, owner])
  );
  assert.equal(del.affectedRows, 0);
  const ins = asUser(db, manager, () =>
    db.query(`insert into public.organisation_members (organisation_id,user_id,role) values ($1,$2,'staff')`, [org, owner])
  );
  await assert.rejects(ins);
});

test("staff cannot self-promote", async () => {
  const { staff, org } = await setup();
  const r = await asUser(db, staff, () =>
    db.query(`update public.organisation_members set role='manager' where organisation_id=$1 and user_id=$2`, [org, staff])
  );
  assert.equal(r.affectedRows, 0);
});

test("owner cannot add a second owner (insert or promote)", async () => {
  const { owner, manager, org } = await setup();
  const outsider = await newUser(db, "outsider");
  await assert.rejects(
    asUser(db, owner, () =>
      db.query(`insert into public.organisation_members (organisation_id,user_id,role) values ($1,$2,'owner')`, [org, outsider])
    ),
    /transfer_ownership/
  );
  await assert.rejects(
    asUser(db, owner, () =>
      db.query(`update public.organisation_members set role='owner' where organisation_id=$1 and user_id=$2`, [org, manager])
    ),
    /transfer_ownership/
  );
  assert.equal(await role(org, manager), "manager");
});

test("service role cannot add a second owner either", async () => {
  const { manager, org } = await setup();
  await assert.rejects(
    asUser(db, null, () =>
      db.query(`update public.organisation_members set role='owner' where organisation_id=$1 and user_id=$2`, [org, manager]),
      "service_role"
    )
  );
});

test("owner cannot demote or remove themselves (last owner)", async () => {
  const { owner, org } = await setup();
  await assert.rejects(
    asUser(db, owner, () =>
      db.query(`update public.organisation_members set role='manager' where organisation_id=$1 and user_id=$2`, [org, owner])
    ),
    /own role/
  );
  await assert.rejects(
    asUser(db, owner, () =>
      db.query(`delete from public.organisation_members where organisation_id=$1 and user_id=$2`, [org, owner])
    ),
    /Transfer ownership/
  );
  assert.equal(await role(org, owner), "owner");
});

test("platform admin cannot delete the owner row directly", async () => {
  const { owner, org } = await setup();
  const adminUser = await newUser(db, "padmin");
  await makePlatformAdmin(db, adminUser);
  await assert.rejects(
    asUser(db, adminUser, () =>
      db.query(`delete from public.organisation_members where organisation_id=$1 and user_id=$2`, [org, owner])
    ),
    /Transfer ownership/
  );
});

test("owner can still manage manager/staff roles and remove staff", async () => {
  const { owner, manager, staff, org } = await setup();
  const r = await asUser(db, owner, () =>
    db.query(`update public.organisation_members set role='staff' where organisation_id=$1 and user_id=$2`, [org, manager])
  );
  assert.equal(r.affectedRows, 1);
  const d = await asUser(db, owner, () =>
    db.query(`delete from public.organisation_members where organisation_id=$1 and user_id=$2`, [org, staff])
  );
  assert.equal(d.affectedRows, 1);
});

test("transfer_ownership: only owner/admin, atomic swap, audited", async () => {
  const { owner, manager, staff, org } = await setup();
  await assert.rejects(
    asUser(db, manager, () => db.query(`select public.transfer_ownership($1,$2)`, [org, manager])),
    /current owner/
  );
  const outsider = await newUser(db, "x");
  await assert.rejects(
    asUser(db, owner, () => db.query(`select public.transfer_ownership($1,$2)`, [org, outsider])),
    /already be a member/
  );
  await asUser(db, owner, () => db.query(`select public.transfer_ownership($1,$2)`, [org, staff]));
  assert.equal(await role(org, staff), "owner");
  assert.equal(await role(org, owner), "manager");
  const owners = await db.query(`select count(*)::int n from public.organisation_members where organisation_id=$1 and role='owner'`, [org]);
  assert.equal(owners.rows[0].n, 1);
  const audit = await db.query(`select metadata from public.audit_logs where organisation_id=$1 and action='organisation.ownership_transferred'`, [org]);
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].metadata.new_owner_user_id, staff);
  // The override flag must not leak into later statements of the session.
  const flag = await db.query(`select coalesce(current_setting('jacita.ownership_transfer', true), '') as v`);
  assert.equal(flag.rows[0].v, "");
});

test("platform admin can transfer (recovery path)", async () => {
  const { manager, org } = await setup();
  const adminUser = await newUser(db, "padmin2");
  await makePlatformAdmin(db, adminUser);
  await asUser(db, adminUser, () => db.query(`select public.transfer_ownership($1,$2)`, [org, manager]));
  assert.equal(await role(org, manager), "owner");
});

test("deleting the business still cascades the owner row", async () => {
  const { owner, org } = await setup();
  const r = await asUser(db, owner, () => db.query(`delete from public.organisations where id=$1`, [org]));
  assert.equal(r.affectedRows, 1);
  const left = await db.query(`select count(*)::int n from public.organisation_members where organisation_id=$1`, [org]);
  assert.equal(left.rows[0].n, 0);
});

test("settings: staff cannot write, manager can, autopilot refused for everyone", async () => {
  const { owner, manager, staff, org } = await setup();
  await db.query(`insert into public.automation_settings (organisation_id, mode) values ($1, 'manual')`, [org]);
  await db.query(`insert into public.advertising_settings (organisation_id) values ($1)`, [org]);

  for (const [table, set] of [
    ["automation_settings", "mode='approval'"],
    ["advertising_settings", "daily_spend_limit_cents=999"],
  ]) {
    const s = await asUser(db, staff, () =>
      db.query(`update public.${table} set ${set} where organisation_id=$1`, [org])
    );
    assert.equal(s.affectedRows, 0, `staff wrote ${table}`);
    const m = await asUser(db, manager, () =>
      db.query(`update public.${table} set ${set} where organisation_id=$1`, [org])
    );
    assert.equal(m.affectedRows, 1, `manager could not write ${table}`);
  }
  const so = await asUser(db, staff, () =>
    db.query(`update public.organisations set autopilot_mode='approval_required' where id=$1`, [org])
  );
  assert.equal(so.affectedRows, 0);

  for (const user of [owner, manager]) {
    await assert.rejects(
      asUser(db, user, () => db.query(`update public.organisations set autopilot_mode='autopilot' where id=$1`, [org])),
      /Autopilot/
    );
    await assert.rejects(
      asUser(db, user, () => db.query(`update public.automation_settings set mode='autopilot' where organisation_id=$1`, [org])),
      /Autopilot/
    );
    await assert.rejects(
      asUser(db, user, () => db.query(`update public.advertising_settings set mode='autopilot' where organisation_id=$1`, [org])),
      /Autopilot/
    );
  }
  await assert.rejects(
    db.query(`update public.automation_settings set mode='autopilot' where organisation_id=$1`, [org]),
    /Autopilot/
  );
  const ok = await asUser(db, manager, () =>
    db.query(`update public.organisations set autopilot_mode='approval_required' where id=$1`, [org])
  );
  assert.equal(ok.affectedRows, 1);
});
