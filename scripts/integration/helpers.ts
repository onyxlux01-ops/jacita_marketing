/**
 * Fixtures for integration tests: real auth users with real RLS-bound
 * sessions against the LOCAL Supabase stack, plus a service-role client for
 * setup and assertions only (never for the behaviour under test).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import {
  assertLocalUrl,
  LOCAL_API_PORT,
  LOCAL_DB_PORT,
} from "../lib/assert-local-db.mjs";
import { createOrgAsOwner } from "../lib/create-test-org.mjs";
import { itest } from "./state";

const url = assertLocalUrl(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  "NEXT_PUBLIC_SUPABASE_URL",
  LOCAL_API_PORT
);
const anonKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const noSession = { auth: { autoRefreshToken: false, persistSession: false } };

/** Service-role client for fixture setup + assertions. */
export const admin: SupabaseClient = createClient(url, serviceKey, noSession);

export type TestUser = {
  id: string;
  email: string;
  client: SupabaseClient;
};

const PASSWORD = `itest-${randomBytes(6).toString("hex")}`;
const RUN = `${Date.now().toString(36)}${randomBytes(2).toString("hex")}`;

export function uniq(label: string) {
  return `${label}-${RUN}-${randomBytes(3).toString("hex")}`;
}

export async function createUser(label: string): Promise<TestUser> {
  const email = `${uniq(label)}@itest.local`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  const client = createClient(url, anonKey, noSession);
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;
  return { id: data.user.id, email, client };
}

/** Make `user` the session that server actions see via createClient(). */
export function actAs(user: TestUser | null) {
  itest.userClient = user ? user.client : null;
}

/**
 * A business owned by `owner`. Only the platform admin may create
 * businesses, so ordinary test owners go through the LOCAL-Postgres fixture
 * (temporary admin flag inside one transaction; see create-test-org.mjs).
 * The rule itself is tested with real sessions in 97-admin-only-orgs.
 */
export async function createOrg(owner: TestUser, label = "biz") {
  const slug = uniq(label).toLowerCase();
  return (await createOrgAsOwner(owner.id, {
    p_name: `Test ${label}`,
    p_slug: slug,
  })) as string;
}

/**
 * Fixture shortcut: add a member (setup only). Members normally join only via
 * accept_invite(); the fixture goes to the LOCAL Postgres (guarded) and sets
 * the same transaction flag that RPC sets.
 */
export async function addMember(
  orgId: string,
  user: TestUser,
  role: "manager" | "staff"
) {
  const dbUrl = assertLocalUrl(process.env.SUPABASE_DB_URL!, "SUPABASE_DB_URL", LOCAL_DB_PORT);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('jacita.invite_accept', 'on', true)");
    const r = await client.query(
      "insert into public.organisation_members (organisation_id, user_id, role) values ($1, $2, $3) returning id",
      [orgId, user.id, role]
    );
    await client.query("commit");
    return r.rows[0].id as string;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }
}

/**
 * Flag a user as platform admin. users.is_platform_admin is protected by a
 * trigger that only lets an existing admin flip it, so this goes straight to
 * the LOCAL Postgres (guarded) and bypasses that trigger for the fixture.
 */
export async function makePlatformAdmin(userId: string) {
  const dbUrl = assertLocalUrl(process.env.SUPABASE_DB_URL!, "SUPABASE_DB_URL", LOCAL_DB_PORT);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("set local session_replication_role = replica");
    await client.query("update public.users set is_platform_admin = true where id = $1", [
      userId,
    ]);
    await client.query("commit");
  } finally {
    await client.end();
  }
}

export async function membership(orgId: string, userId: string) {
  const { data } = await admin
    .from("organisation_members")
    .select("id, role")
    .eq("organisation_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; role: string } | null;
}

/** Org with owner + manager + staff. */
export async function teamOrg(label = "team") {
  const owner = await createUser(`${label}-owner`);
  const manager = await createUser(`${label}-manager`);
  const staff = await createUser(`${label}-staff`);
  const orgId = await createOrg(owner, label);
  await addMember(orgId, manager, "manager");
  await addMember(orgId, staff, "staff");
  return { orgId, owner, manager, staff };
}

/**
 * Mark a platform account as connected with a stored (encrypted) token, the
 * way the OAuth callback would.
 */
export async function connectAccount(
  orgId: string,
  platform: "facebook" | "instagram" | "tiktok",
  externalAccountId = `ext-${platform}-${randomBytes(3).toString("hex")}`,
  metadata: Record<string, unknown> = {}
) {
  const { saveAccountSecrets } = await import("../../src/lib/social/secrets");
  const { data, error } = await admin
    .from("social_accounts")
    .update({
      connection_status: "connected",
      health_status: "healthy",
      external_account_id: externalAccountId,
      account_name: `Acct ${platform}`,
      metadata,
    })
    .eq("organisation_id", orgId)
    .eq("platform", platform)
    .select("id")
    .single();
  if (error) throw error;
  await saveAccountSecrets({
    socialAccountId: data.id,
    organisationId: orgId,
    token: { accessToken: `user-token-${platform}`, pageAccessToken: "page-token" },
  });
  return data.id as string;
}

/** Content row (+ platform rows) created by the service role. */
export async function createContent(
  orgId: string,
  createdBy: string,
  status: string,
  platforms: Array<"facebook" | "instagram" | "tiktok"> = ["facebook"]
) {
  const { data, error } = await admin
    .from("content")
    .insert({
      organisation_id: orgId,
      title: uniq("post"),
      caption: "Hello from the integration suite",
      status,
      created_by: createdBy,
    })
    .select("id")
    .single();
  if (error) throw error;
  const platformIds: Record<string, string> = {};
  for (const platform of platforms) {
    const { data: cp, error: cpError } = await admin
      .from("content_platforms")
      .insert({ content_id: data.id, platform })
      .select("id")
      .single();
    if (cpError) throw cpError;
    platformIds[platform] = cp.id;
  }
  return { contentId: data.id as string, platformIds };
}

/**
 * Scheduling refuses past times, so tests schedule a little ahead and then
 * make the queued jobs due with the service role.
 */
export async function makeDue(contentId: string) {
  const { error } = await admin
    .from("social_publish_jobs")
    .update({ scheduled_at: new Date(Date.now() - 30_000).toISOString() })
    .eq("content_id", contentId)
    .in("status", ["pending", "ready"]);
  if (error) throw error;
}

export const soon = () => new Date(Date.now() + 120_000).toISOString();

export async function jobsFor(contentId: string) {
  const { data, error } = await admin
    .from("social_publish_jobs")
    .select("*")
    .eq("content_id", contentId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data as Array<Record<string, unknown>>;
}

/**
 * Run SQL on the LOCAL Postgres as the database owner (guarded). Fixture use
 * only, e.g. to simulate a failing write with a temporary trigger.
 */
export async function localSql(sql: string, params: unknown[] = []) {
  const dbUrl = assertLocalUrl(process.env.SUPABASE_DB_URL!, "SUPABASE_DB_URL", LOCAL_DB_PORT);
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    return await client.query(sql, params);
  } finally {
    await client.end();
  }
}
