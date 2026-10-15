// Only the platform admin may create a business (20261015100000).
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  freshDb,
  newUser,
  callCreateOrg,
  rpcCreateOrg,
  makePlatformAdmin,
  fixtureQuery,
} from "./db.mjs";

const db = await freshDb();

const orgCount = async () =>
  Number((await db.query(`select count(*)::int as n from public.organisations`)).rows[0].n);

test("a signed-in non-admin cannot create a business", async () => {
  const user = await newUser(db, "plain");
  const before = await orgCount();
  await assert.rejects(callCreateOrg(db, user, "Nope"), /ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS/);
  assert.equal(await orgCount(), before);
});

test("the private implementation refuses non-admins too", async () => {
  const user = await newUser(db, "plain-private");
  // Run as the database owner (like a security-definer caller would) with
  // the user's JWT: the private body must still refuse.
  await db.exec("begin");
  try {
    await db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [user]);
    await assert.rejects(
      db.query(`select private.create_organisation('X', 'x-private')`),
      /ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS/
    );
  } finally {
    await db.exec("rollback");
  }
});

test("the platform admin creates a business and becomes its single owner", async () => {
  const adminUser = await newUser(db, "admin");
  await makePlatformAdmin(db, adminUser);
  const org = await callCreateOrg(db, adminUser, "Admin");
  const owners = await db.query(
    `select user_id from public.organisation_members where organisation_id = $1 and role = 'owner'`,
    [org]
  );
  assert.deepEqual(owners.rows.map((r) => r.user_id), [adminUser]);
});

test("anon cannot create a business", async () => {
  await assert.rejects(callCreateOrg(db, null, "Anon", "anon"), /permission denied|Not authenticated/);
});

test("owner, manager and staff of an existing business still cannot create one", async () => {
  const owner = await newUser(db, "owner");
  const manager = await newUser(db, "manager");
  const staff = await newUser(db, "staff");
  const org = await rpcCreateOrg(db, owner, "Existing");
  await fixtureQuery(
    db,
    `insert into public.organisation_members (organisation_id, user_id, role) values ($1,$2,'manager'),($1,$3,'staff')`,
    [org, manager, staff]
  );
  // The fixture's temporary admin flag is gone again.
  const flag = await db.query(`select is_platform_admin from public.users where id = $1`, [owner]);
  assert.equal(flag.rows[0].is_platform_admin, false);
  for (const user of [owner, manager, staff]) {
    await assert.rejects(callCreateOrg(db, user, "Extra"), /ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS/);
  }
});
