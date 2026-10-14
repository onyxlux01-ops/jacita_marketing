import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSupabasePublishableKey, getSupabaseUrl } from "@/lib/supabase/env";
import { getAppBaseUrl } from "@/lib/social/oauth-state";

/** Lower-case, trimmed; null if it is not plausibly an email address. */
export function normaliseInviteEmail(raw: string) {
  const email = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/**
 * The page an invite email links to. Built from the configured app URL
 * (never from request headers, so a spoofed Host cannot redirect invitees).
 */
export function inviteAcceptUrl(inviteId: string) {
  return `${getAppBaseUrl()}/invite/${inviteId}`;
}

/**
 * Email the invite.
 * - New address: Supabase Auth invite (creates the account, works with public
 *   signup disabled; the invitee sets a password after accepting).
 * - Existing account: a one-time sign-in link (never creates a user).
 * Both land on /invite/<id>, where the invitee accepts explicitly.
 */
export async function sendInviteEmail(email: string, inviteId: string) {
  const redirectTo = inviteAcceptUrl(inviteId);
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
  if (!error) return { ok: true as const, kind: "new_account" as const };

  const alreadyExists =
    error.status === 422 || /already (been )?registered|already exists/i.test(error.message);
  if (!alreadyExists) return { ok: false as const, error: error.message };

  const anon = createSupabaseClient(getSupabaseUrl(), getSupabasePublishableKey(), {
    auth: { persistSession: false, autoRefreshToken: false, flowType: "implicit" },
  });
  const { error: otpError } = await anon.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: redirectTo },
  });
  if (otpError) return { ok: false as const, error: otpError.message };
  return { ok: true as const, kind: "existing_account" as const };
}
