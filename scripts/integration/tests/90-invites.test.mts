/**
 * PR 8: invites and private access, against the local Auth server and its
 * Mailpit inbox (http://127.0.0.1:55424). No external mail is sent.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import {
  actAs,
  admin,
  createOrg,
  createUser,
  makePlatformAdmin,
  membership,
  teamOrg,
  uniq,
} from "../helpers.ts";

const actions = () => import("../../../src/app/(app)/app/actions/onboarding");
const MAILPIT = "http://127.0.0.1:55424";

const anon = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

/** Wait for Mailpit to receive a message for `email`; returns their subjects. */
async function mailFor(email: string, atLeast = 1, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let subjects: string[] = [];
  while (Date.now() < deadline) {
    const res = await fetch(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`
    );
    const body = (await res.json()) as { messages?: Array<{ Subject: string }> };
    subjects = (body.messages ?? []).map((m) => m.Subject);
    if (subjects.length >= atLeast) return subjects;
    await new Promise((r) => setTimeout(r, 250));
  }
  return subjects;
}

async function invite(
  actor: Parameters<typeof actAs>[0],
  organisationId: string,
  email: string,
  role: "manager" | "staff" | "owner" = "staff"
) {
  const { inviteTeamMember } = await actions();
  actAs(actor);
  const res = await inviteTeamMember({ organisationId, email, role: role as never });
  actAs(null);
  return res as { success?: true; error?: string; inviteId?: string; message?: string };
}

async function accept(user: Parameters<typeof actAs>[0], inviteId: string) {
  const { acceptInvite } = await actions();
  actAs(user);
  const res = await acceptInvite(inviteId);
  actAs(null);
  return res as { success?: true; error?: string; code?: string };
}

test("invite: a new address gets an Auth invite email; email stored normalised", async () => {
  const { orgId, owner } = await teamOrg("inv-new");
  const address = `${uniq("newperson")}@ITEST.local`;
  const res = await invite(owner, orgId, `  ${address} `);
  assert.ok(res.success, JSON.stringify(res));
  const { data: row } = await admin
    .from("organisation_invites")
    .select("email, role, status, invited_by, expires_at, send_count")
    .eq("id", res.inviteId!)
    .single();
  assert.equal(row?.email, address.toLowerCase());
  assert.equal(row?.status, "pending");
  assert.equal(row?.invited_by, owner.id);
  assert.equal(row?.send_count, 1);
  assert.ok(new Date(row!.expires_at).getTime() > Date.now() + 13 * 86_400_000);
  const mail = await mailFor(address.toLowerCase());
  assert.equal(mail.length, 1, JSON.stringify(mail));
});

test("invite: the right person accepts; a different email is rejected", async () => {
  const { orgId, owner } = await teamOrg("inv-accept");
  const invitee = await createUser("invitee");
  const stranger = await createUser("stranger");
  const res = await invite(owner, orgId, invitee.email.toUpperCase(), "manager");
  assert.ok(res.success, JSON.stringify(res));
  // Existing account: a sign-in link email (no new user is created).
  assert.equal((await mailFor(invitee.email)).length, 1);

  const wrong = await accept(stranger, res.inviteId!);
  assert.equal(wrong.code, "WRONG_EMAIL", JSON.stringify(wrong));
  assert.equal(await membership(orgId, stranger.id), null);

  const ok = await accept(invitee, res.inviteId!);
  assert.ok(ok.success, JSON.stringify(ok));
  assert.equal((await membership(orgId, invitee.id))?.role, "manager");
  const { data: inv } = await admin
    .from("organisation_invites")
    .select("status, accepted_user_id")
    .eq("id", res.inviteId!)
    .single();
  assert.deepEqual(inv, { status: "accepted", accepted_user_id: invitee.id });
  const { data: audit } = await admin
    .from("audit_logs")
    .select("action")
    .eq("organisation_id", orgId)
    .eq("action", "team.invite_accepted");
  assert.equal(audit?.length, 1);

  // Accepting twice changes nothing.
  const again = await accept(invitee, res.inviteId!);
  assert.equal(again.code, "NOT_PENDING", JSON.stringify(again));
});

test("invite: expired and revoked invites are rejected", async () => {
  const { orgId, owner } = await teamOrg("inv-dead");
  const a = await createUser("expiring");
  const b = await createUser("revoked");
  const ia = await invite(owner, orgId, a.email);
  const ib = await invite(owner, orgId, b.email);
  assert.ok(ia.success && ib.success, JSON.stringify([ia, ib]));

  await admin
    .from("organisation_invites")
    .update({ expires_at: new Date(Date.now() - 60_000).toISOString() })
    .eq("id", ia.inviteId!);
  const expired = await accept(a, ia.inviteId!);
  assert.equal(expired.code, "EXPIRED", JSON.stringify(expired));

  const { revokeInvite } = await actions();
  actAs(owner);
  const rev = await revokeInvite({ organisationId: orgId, inviteId: ib.inviteId! });
  actAs(null);
  assert.ok("success" in rev && rev.success, JSON.stringify(rev));
  const revoked = await accept(b, ib.inviteId!);
  assert.equal(revoked.code, "NOT_PENDING", JSON.stringify(revoked));
  assert.equal(await membership(orgId, a.id), null);
  assert.equal(await membership(orgId, b.id), null);
});

test("invite: an owner invite is impossible (action, Data API and service role)", async () => {
  const { orgId, owner } = await teamOrg("inv-owner");
  const res = await invite(owner, orgId, `${uniq("o")}@itest.local`, "owner");
  assert.ok(res.error, JSON.stringify(res));
  const direct = await owner.client.from("organisation_invites").insert({
    organisation_id: orgId,
    email: `${uniq("o2")}@itest.local`,
    role: "owner",
    token: uniq("tok"),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.equal(direct.error?.code, "23514", JSON.stringify(direct.error));
  const svc = await admin.from("organisation_invites").insert({
    organisation_id: orgId,
    email: `${uniq("o3")}@itest.local`,
    role: "owner",
    token: uniq("tok"),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.equal(svc.error?.code, "23514", JSON.stringify(svc.error));
});

test("invite: managers cannot invite, resend or revoke", async () => {
  const { orgId, owner, manager } = await teamOrg("inv-mgr");
  const res = await invite(manager, orgId, `${uniq("m")}@itest.local`);
  assert.ok(res.error, JSON.stringify(res));
  const ok = await invite(owner, orgId, `${uniq("m2")}@itest.local`);
  assert.ok(ok.success, JSON.stringify(ok));
  const { resendInvite, revokeInvite } = await actions();
  actAs(manager);
  const resend = await resendInvite({ organisationId: orgId, inviteId: ok.inviteId! });
  const revoke = await revokeInvite({ organisationId: orgId, inviteId: ok.inviteId! });
  actAs(null);
  assert.ok("error" in resend && resend.error, JSON.stringify(resend));
  assert.ok("error" in revoke && revoke.error, JSON.stringify(revoke));
  // RLS refuses the manager's direct write too.
  const direct = await manager.client.from("organisation_invites").insert({
    organisation_id: orgId,
    email: `${uniq("m3")}@itest.local`,
    role: "staff",
    token: uniq("tok"),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  });
  assert.ok(direct.error, "manager insert must fail");
});

test("invite: the owner can resend (second email, expiry extended)", async () => {
  const { orgId, owner } = await teamOrg("inv-resend");
  const person = await createUser("resend");
  const res = await invite(owner, orgId, person.email);
  assert.ok(res.success, JSON.stringify(res));
  await admin
    .from("organisation_invites")
    .update({ expires_at: new Date(Date.now() + 3_600_000).toISOString() })
    .eq("id", res.inviteId!);
  // Local auth allows one email per address per second (max_frequency).
  await new Promise((r) => setTimeout(r, 1500));
  const { resendInvite } = await actions();
  actAs(owner);
  const again = await resendInvite({ organisationId: orgId, inviteId: res.inviteId! });
  actAs(null);
  assert.ok("success" in again && again.success, JSON.stringify(again));
  assert.equal((await mailFor(person.email, 2)).length, 2);
  const { data } = await admin
    .from("organisation_invites")
    .select("expires_at, send_count")
    .eq("id", res.inviteId!)
    .single();
  assert.ok(new Date(data!.expires_at).getTime() > Date.now() + 13 * 86_400_000);
  assert.equal(data?.send_count, 2);
});

test("invite: a platform admin can invite into a client's business", async () => {
  const clientOwner = await createUser("client-owner");
  const orgId = await createOrg(clientOwner, "client-biz");
  const platformAdmin = await createUser("platform-admin");
  await makePlatformAdmin(platformAdmin.id);
  const person = await createUser("admin-invitee");
  const res = await invite(platformAdmin, orgId, person.email, "manager");
  assert.ok(res.success, JSON.stringify(res));
  const ok = await accept(person, res.inviteId!);
  assert.ok(ok.success, JSON.stringify(ok));
  assert.equal((await membership(orgId, person.id))?.role, "manager");
  // The admin did not become a member.
  assert.equal(await membership(orgId, platformAdmin.id), null);
});

test("access: nobody joins a business without accepting an invite", async () => {
  const { orgId, owner } = await teamOrg("inv-direct");
  const outsider = await createUser("outsider");
  const asOwner = await owner.client
    .from("organisation_members")
    .insert({ organisation_id: orgId, user_id: outsider.id, role: "staff" });
  assert.ok(asOwner.error, "owner direct insert must fail");
  const asService = await admin
    .from("organisation_members")
    .insert({ organisation_id: orgId, user_id: outsider.id, role: "staff" });
  assert.equal(asService.error?.code, "42501", JSON.stringify(asService.error));
  assert.equal(await membership(orgId, outsider.id), null);
});

test("access: public signup is refused by the local auth server", async () => {
  const { data, error } = await anon().auth.signUp({
    email: `${uniq("signup")}@itest.local`,
    password: "Signup-Attempt-123",
  });
  assert.ok(error, JSON.stringify(data));
  assert.match(error.message, /signups not allowed/i);
});

test("access: password recovery sends a reset email", async () => {
  const user = await createUser("recover");
  const { error } = await anon().auth.resetPasswordForEmail(user.email, {
    redirectTo: "http://localhost:3000/auth/callback?next=/reset-password",
  });
  assert.equal(error, null, error?.message);
  const subjects = await mailFor(user.email);
  assert.equal(subjects.length, 1);
  assert.match(subjects[0], /reset/i);
});

test("config: production uses NEXT_PUBLIC_APP_URL, then APP_URL, else refuses", async () => {
  const { getAppBaseUrl } = await import("../../../src/lib/social/oauth-state");
  const env = process.env as Record<string, string | undefined>;
  const saved = { node: env.NODE_ENV, url: env.NEXT_PUBLIC_APP_URL, app: env.APP_URL };
  try {
    env.NODE_ENV = "production";
    delete env.NEXT_PUBLIC_APP_URL;
    delete env.APP_URL;
    assert.throws(() => getAppBaseUrl(), /NEXT_PUBLIC_APP_URL nor APP_URL/);

    // An invite is refused up front, before anything is recorded.
    const { orgId, owner } = await teamOrg("inv-nourl");
    const res = await invite(owner, orgId, `${uniq("nourl")}@itest.local`);
    assert.match(String(res.error), /not configured/);
    const { count } = await admin
      .from("organisation_invites")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId);
    assert.equal(count, 0);

    // APP_URL is accepted when NEXT_PUBLIC_APP_URL is missing ...
    env.APP_URL = "https://server-only.example.com/";
    assert.equal(getAppBaseUrl(), "https://server-only.example.com");
    // ... and NEXT_PUBLIC_APP_URL wins when both are set.
    env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";
    assert.equal(getAppBaseUrl(), "https://app.example.com");
  } finally {
    env.NODE_ENV = saved.node;
    if (saved.url === undefined) delete env.NEXT_PUBLIC_APP_URL;
    else env.NEXT_PUBLIC_APP_URL = saved.url;
    if (saved.app === undefined) delete env.APP_URL;
    else env.APP_URL = saved.app;
  }
  assert.equal(getAppBaseUrl(), "http://localhost:3000");
});
