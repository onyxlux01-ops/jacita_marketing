/**
 * Only the platform admin may create a business. Checked through the real
 * server action and directly through the RPC with real user sessions (what
 * an invited assistant could try from the browser).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  actAs,
  admin,
  createUser,
  makePlatformAdmin,
  membership,
  teamOrg,
  uniq,
  type TestUser,
} from "../helpers.ts";

const actions = () => import("../../../src/app/(app)/app/actions/onboarding");
const CODE = "ONLY_PLATFORM_ADMIN_CAN_CREATE_BUSINESS";

const anonClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

async function orgBySlug(slug: string) {
  const { data } = await admin.from("organisations").select("id").eq("slug", slug).maybeSingle();
  return data as { id: string } | null;
}

async function viaAction(user: TestUser, slug: string) {
  const { createOrganisationOnboarding } = await actions();
  const form = new FormData();
  form.set("name", `Biz ${slug}`);
  form.set("slug", slug);
  actAs(user);
  try {
    return { result: await createOrganisationOnboarding(form), redirect: null as string | null };
  } catch (e) {
    const url = (e as { url?: string }).url;
    if (!url) throw e;
    return { result: undefined, redirect: url };
  } finally {
    actAs(null);
  }
}

async function viaRpc(client: TestUser["client"], slug: string) {
  return client.rpc("create_organisation", { p_name: `Biz ${slug}`, p_slug: slug });
}

test("admin-only orgs: a signed-in non-admin is refused by the server action", async () => {
  const user = await createUser("plain-action");
  const slug = uniq("plain-action").toLowerCase();
  const { result, redirect } = await viaAction(user, slug);
  assert.equal(redirect, null);
  assert.equal(result?.code, CODE, JSON.stringify(result));
  assert.match(result!.error, /Only the workspace administrator can add businesses/);
  assert.equal(await orgBySlug(slug), null);
});

test("admin-only orgs: a signed-in non-admin is refused by the RPC directly", async () => {
  const user = await createUser("plain-rpc");
  const slug = uniq("plain-rpc").toLowerCase();
  const { data, error } = await viaRpc(user.client, slug);
  assert.equal(data, null);
  assert.equal(error?.code, "42501", JSON.stringify(error));
  assert.match(error!.message, new RegExp(CODE));
  assert.equal(await orgBySlug(slug), null);
});

test("admin-only orgs: anon is refused", async () => {
  const slug = uniq("anon").toLowerCase();
  const { data, error } = await viaRpc(anonClient(), slug);
  assert.equal(data, null);
  // anon has no EXECUTE grant on the function at all.
  assert.equal(error?.code, "42501", JSON.stringify(error));
  assert.equal(await orgBySlug(slug), null);
});

test("admin-only orgs: the platform admin creates a business and becomes its owner (action)", async () => {
  const platformAdmin = await createUser("admin-action");
  await makePlatformAdmin(platformAdmin.id);
  const slug = uniq("admin-action").toLowerCase();
  const { result, redirect } = await viaAction(platformAdmin, slug);
  assert.equal(result, undefined, JSON.stringify(result));
  assert.equal(redirect, "/app/onboarding/setup?step=brand");
  const org = await orgBySlug(slug);
  assert.ok(org, "organisation must exist");
  assert.equal((await membership(org.id, platformAdmin.id))?.role, "owner");
});

test("admin-only orgs: the platform admin creates a business and becomes its owner (RPC)", async () => {
  const platformAdmin = await createUser("admin-rpc");
  await makePlatformAdmin(platformAdmin.id);
  const slug = uniq("admin-rpc").toLowerCase();
  const { data, error } = await viaRpc(platformAdmin.client, slug);
  assert.equal(error, null, JSON.stringify(error));
  assert.equal((await membership(data as string, platformAdmin.id))?.role, "owner");
  const { data: owners } = await admin
    .from("organisation_members")
    .select("user_id")
    .eq("organisation_id", data as string)
    .eq("role", "owner");
  assert.deepEqual(owners?.map((o) => o.user_id), [platformAdmin.id]);
});

test("admin-only orgs: owner, manager and staff of a business still cannot create another", async () => {
  const { owner, manager, staff } = await teamOrg("admin-only-team");
  for (const user of [owner, manager, staff]) {
    const rpcSlug = uniq("team-rpc").toLowerCase();
    const { error } = await viaRpc(user.client, rpcSlug);
    assert.match(error?.message ?? "", new RegExp(CODE), JSON.stringify(error));
    assert.equal(await orgBySlug(rpcSlug), null);

    const actionSlug = uniq("team-action").toLowerCase();
    const { result, redirect } = await viaAction(user, actionSlug);
    assert.equal(redirect, null);
    assert.equal(result?.code, CODE, JSON.stringify(result));
    assert.equal(await orgBySlug(actionSlug), null);
  }
});

test("admin-only orgs: the test fixture leaves owners without the admin flag", async () => {
  const { owner } = await teamOrg("admin-only-flag");
  const { data } = await admin
    .from("users")
    .select("is_platform_admin")
    .eq("id", owner.id)
    .single();
  assert.equal(data?.is_platform_admin, false);
});
