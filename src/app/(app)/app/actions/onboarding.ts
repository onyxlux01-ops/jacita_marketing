"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { setActiveOrganisationCookie } from "@/lib/org";
import type { MarketingGoalKey } from "@/lib/ai/goals";
import type { OnboardingStep } from "@/lib/org/setup-progress";
import type { OrgRole } from "@/lib/database.types";
import type { Json } from "@/lib/database.types";
import {
  inviteLinksError,
  normaliseInviteEmail,
  sendInviteEmail,
} from "@/lib/team/invite-email";

async function getAuthed() {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" as const };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

async function requireManage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string,
  roles: OrgRole[] = ["owner", "manager"]
) {
  const { data } = await supabase
    .from("organisation_members")
    .select("role")
    .eq("organisation_id", organisationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || !roles.includes(data.role as OrgRole)) return null;
  return data;
}

export async function createOrganisationOnboarding(formData: FormData) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const name = String(formData.get("name") ?? "").trim();
  let slug = String(formData.get("slug") ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");

  if (!name) return { error: "Business name is required" };
  if (!slug) {
    slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  const country = String(formData.get("country") ?? "").trim() || null;
  const location = String(formData.get("location") ?? "").trim() || null;
  const locationCombined = [location, country].filter(Boolean).join(", ") || null;

  const { data: orgId, error } = await auth.supabase.rpc("create_organisation", {
    p_name: name,
    p_slug: slug,
    p_business_category:
      String(formData.get("business_category") ?? "") || undefined,
    p_description: String(formData.get("description") ?? "") || undefined,
    p_location: locationCombined || undefined,
    p_website: String(formData.get("website") ?? "") || undefined,
    p_booking_url: String(formData.get("booking_url") ?? "") || undefined,
    p_phone: String(formData.get("phone") ?? "") || undefined,
    p_email: String(formData.get("email") ?? "") || undefined,
    p_opening_hours: undefined,
  });

  if (error) return { error: error.message };
  if (!orgId) return { error: "Could not create business" };

  await auth.supabase
    .from("organisations")
    .update({
      country,
      onboarding_step: "brand",
    })
    .eq("id", orgId);

  await setActiveOrganisationCookie(String(orgId));
  revalidatePath("/", "layout");
  redirect(`/app/onboarding/setup?step=brand`);
}

export async function saveOnboardingBrand(formData: FormData) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const organisationId = String(formData.get("organisation_id") ?? "");
  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  const logo = formData.get("logo");
  let logoPath: string | null = null;
  if (logo instanceof File && logo.size > 0) {
    const ext = logo.name.split(".").pop() || "png";
    logoPath = `${organisationId}/logo-${Date.now()}.${ext}`;
    const { error: uploadError } = await auth.supabase.storage
      .from("brand")
      .upload(logoPath, logo, { upsert: true });
    if (uploadError) return { error: uploadError.message };
    await auth.supabase
      .from("organisations")
      .update({ logo_path: logoPath })
      .eq("id", organisationId);
  }

  const { error } = await auth.supabase
    .from("brand_profiles")
    .update({
      brand_voice: String(formData.get("brand_voice") ?? "") || null,
      tone: String(formData.get("tone") ?? "") || null,
      target_audience: String(formData.get("target_audience") ?? "") || null,
      business_description:
        String(formData.get("business_description") ?? "") || null,
      preferred_terminology:
        String(formData.get("preferred_terminology") ?? "") || null,
      words_to_avoid: String(formData.get("words_to_avoid") ?? "") || null,
      primary_color: String(formData.get("primary_color") ?? "") || null,
      secondary_color: String(formData.get("secondary_color") ?? "") || null,
      custom_instructions:
        String(formData.get("custom_instructions") ?? "") || null,
      ...(logoPath ? { logo_path: logoPath } : {}),
    })
    .eq("organisation_id", organisationId);

  if (error) return { error: error.message };

  await advanceOnboardingStep(auth.supabase, organisationId, "services");
  revalidatePath("/app/onboarding/setup");
  revalidatePath("/app/settings");
  return { success: true, next: "services" as const };
}

export async function saveOnboardingAudience(formData: FormData) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const organisationId = String(formData.get("organisation_id") ?? "");
  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  const interests = String(formData.get("interests") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const customerTypes = String(formData.get("customer_types") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const ideal = String(formData.get("ideal_customer_description") ?? "") || null;

  const { error } = await auth.supabase.from("audience_profiles").upsert(
    {
      organisation_id: organisationId,
      age_range: String(formData.get("age_range") ?? "") || null,
      location_focus: String(formData.get("location_focus") ?? "") || null,
      interests,
      customer_types: customerTypes,
      income_lifestyle: String(formData.get("income_lifestyle") ?? "") || null,
      ideal_customer_description: ideal,
      additional_notes: String(formData.get("additional_notes") ?? "") || null,
    },
    { onConflict: "organisation_id" }
  );
  if (error) return { error: error.message };

  // Keep brand target_audience in sync for AI context compatibility
  if (ideal) {
    await auth.supabase
      .from("brand_profiles")
      .update({ target_audience: ideal })
      .eq("organisation_id", organisationId);
  }

  await advanceOnboardingStep(auth.supabase, organisationId, "goals");
  revalidatePath("/app/onboarding/setup");
  revalidatePath("/app/settings");
  return { success: true, next: "goals" as const };
}

export async function saveOnboardingGoals(formData: FormData) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const organisationId = String(formData.get("organisation_id") ?? "");
  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  const primary = String(formData.get("primary_goal") ?? "") as MarketingGoalKey;
  const selected = formData.getAll("goals").map(String) as MarketingGoalKey[];
  const goals = Array.from(new Set([primary, ...selected].filter(Boolean)));

  if (!primary) return { error: "Choose a primary marketing goal" };

  await auth.supabase
    .from("organisations")
    .update({ primary_marketing_goal_key: primary })
    .eq("id", organisationId);

  // Archive previous then upsert active
  await auth.supabase
    .from("marketing_goals")
    .update({ status: "archived" })
    .eq("organisation_id", organisationId)
    .eq("status", "active");

  for (const key of goals) {
    const { data: existing } = await auth.supabase
      .from("marketing_goals")
      .select("id")
      .eq("organisation_id", organisationId)
      .eq("goal_key", key)
      .maybeSingle();

    if (existing) {
      await auth.supabase
        .from("marketing_goals")
        .update({
          status: "active",
          title: key.replaceAll("_", " "),
        })
        .eq("id", existing.id);
    } else {
      await auth.supabase.from("marketing_goals").insert({
        organisation_id: organisationId,
        goal_key: key,
        title: key.replaceAll("_", " "),
        status: "active",
      });
    }
  }

  await advanceOnboardingStep(auth.supabase, organisationId, "media");
  revalidatePath("/app/onboarding/setup");
  revalidatePath("/app/settings");
  return { success: true, next: "media" as const };
}

export async function skipOnboardingStep(input: {
  organisationId: string;
  step: OnboardingStep;
  next: OnboardingStep;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    input.organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  const { data: org } = await auth.supabase
    .from("organisations")
    .select("onboarding_skipped")
    .eq("id", input.organisationId)
    .maybeSingle();

  const skipped = Array.isArray(org?.onboarding_skipped)
    ? [...(org!.onboarding_skipped as string[])]
    : [];
  if (!skipped.includes(input.step)) skipped.push(input.step);

  await auth.supabase
    .from("organisations")
    .update({
      onboarding_skipped: skipped as Json,
      onboarding_step: input.next,
    })
    .eq("id", input.organisationId);

  revalidatePath("/app/onboarding/setup");
  return { success: true };
}

export async function completeOnboarding(organisationId: string) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  await auth.supabase
    .from("organisations")
    .update({
      onboarding_completed_at: new Date().toISOString(),
      onboarding_step: "complete",
    })
    .eq("id", organisationId);

  revalidatePath("/", "layout");
  redirect("/app/onboarding/complete");
}

export async function advanceToStep(
  organisationId: string,
  step: OnboardingStep
) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    organisationId
  );
  if (!membership) return { error: "Unauthorized" };

  await advanceOnboardingStep(auth.supabase, organisationId, step);
  revalidatePath("/app/onboarding/setup");
  return { success: true };
}

async function advanceOnboardingStep(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organisationId: string,
  step: OnboardingStep
) {
  await supabase
    .from("organisations")
    .update({ onboarding_step: step })
    .eq("id", organisationId);
}

/** Owner of this business, or a platform admin (the recovery path). */
async function requireOwnerOrPlatformAdmin(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  organisationId: string
) {
  const owner = await requireManage(supabase, userId, organisationId, ["owner"]);
  if (owner) return { via: "owner" as const };
  const { data: profile } = await supabase
    .from("users")
    .select("is_platform_admin")
    .eq("id", userId)
    .maybeSingle();
  if (profile?.is_platform_admin) return { via: "platform_admin" as const };
  return null;
}

const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Invite someone to this business (owner or platform admin only). Records
 * the invite and emails a link to /invite/<id>; the person joins only when
 * they accept it there (accept_invite). Never as owner.
 */
export async function inviteTeamMember(input: {
  organisationId: string;
  email: string;
  role: OrgRole;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const allowed = await requireOwnerOrPlatformAdmin(
    auth.supabase,
    auth.user.id,
    input.organisationId
  );
  if (!allowed) return { error: "Only the owner can invite team members" };
  // Fail before recording anything if links cannot be built.
  const linksError = inviteLinksError();
  if (linksError) return { error: `Invites are not configured: ${linksError}` };

  const email = normaliseInviteEmail(input.email ?? "");
  if (!email) return { error: "Enter a valid email" };
  if (input.role === "owner") {
    return {
      error:
        "A business has one owner. Invite them as a manager, then transfer ownership.",
    };
  }
  if (input.role !== "manager" && input.role !== "staff") {
    return { error: "Invalid role" };
  }

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();
  const { data: alreadyMember } = await admin.rpc("is_member_by_email", {
    p_organisation_id: input.organisationId,
    p_email: email,
  });
  if (alreadyMember === true) return { error: "This person is already a member" };

  // Written as the inviter: RLS lets only the owner / a platform admin insert.
  const { data: invite, error } = await auth.supabase
    .from("organisation_invites")
    .insert({
      organisation_id: input.organisationId,
      email,
      role: input.role,
      invited_by: auth.user.id,
      token: randomBytes(24).toString("hex"),
      status: "pending",
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { error: "There is already a pending invite for this email. Resend it instead." };
    }
    return { error: error.message };
  }

  const sent = await sendInviteEmail(email, invite.id);
  if (sent.ok) {
    await admin
      .from("organisation_invites")
      .update({ last_sent_at: new Date().toISOString(), send_count: 1 })
      .eq("id", invite.id);
  }

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "team.invited",
    entity_type: "organisation_invites",
    entity_id: invite.id,
    metadata: { email, role: input.role, via: allowed.via, email_sent: sent.ok },
  });

  revalidatePath("/app/settings");
  if (!sent.ok) {
    return {
      error: `Invite saved, but the email could not be sent (${sent.error}). Use Resend to try again.`,
      inviteId: invite.id as string,
    };
  }
  return {
    success: true as const,
    inviteId: invite.id as string,
    message: `Invite sent to ${email}. They join when they accept it.`,
  };
}

/** Send a pending invite again (owner / platform admin); extends its expiry. */
export async function resendInvite(input: {
  organisationId: string;
  inviteId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  const allowed = await requireOwnerOrPlatformAdmin(
    auth.supabase,
    auth.user.id,
    input.organisationId
  );
  if (!allowed) return { error: "Only the owner can resend invites" };
  const linksError = inviteLinksError();
  if (linksError) return { error: `Invites are not configured: ${linksError}` };

  const { data: invite } = await auth.supabase
    .from("organisation_invites")
    .select("id, email, status, send_count")
    .eq("id", input.inviteId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();
  if (!invite) return { error: "Invite not found" };
  if (invite.status !== "pending") return { error: `This invite is ${invite.status}` };

  const { data: updated, error } = await auth.supabase
    .from("organisation_invites")
    .update({ expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString() })
    .eq("id", invite.id)
    .eq("status", "pending")
    .select("id");
  if (error) return { error: error.message };
  if (!updated?.length) return { error: "Invite could not be updated" };

  const sent = await sendInviteEmail(invite.email, invite.id);
  if (!sent.ok) return { error: `The email could not be sent: ${sent.error}` };
  await auth.supabase
    .from("organisation_invites")
    .update({
      last_sent_at: new Date().toISOString(),
      send_count: (invite.send_count ?? 0) + 1,
    })
    .eq("id", invite.id);

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "team.invite_resent",
    entity_type: "organisation_invites",
    entity_id: invite.id,
    metadata: { email: invite.email, via: allowed.via },
  });
  revalidatePath("/app/settings");
  return { success: true as const };
}

/** Accept an invite as the signed-in user (see accept_invite). */
export async function acceptInvite(inviteId: string) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  const { data, error } = await auth.supabase.rpc("accept_invite", {
    p_invite_id: inviteId,
  });
  if (error) return { error: error.message };
  const result = data as unknown as
    | { ok: true; organisation_id: string; role: OrgRole }
    | { ok: false; code: string; error: string };
  if (!result?.ok) {
    return {
      error: result?.error || "This invite could not be accepted",
      code: result?.code,
    };
  }
  await setActiveOrganisationCookie(result.organisation_id);
  revalidatePath("/", "layout");
  return { success: true as const, organisationId: result.organisation_id, role: result.role };
}

export async function updateMemberRole(input: {
  organisationId: string;
  membershipId: string;
  role: OrgRole;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    input.organisationId,
    ["owner"]
  );
  if (!membership) return { error: "Only owners can change roles" };

  const { data: target } = await auth.supabase
    .from("organisation_members")
    .select("id, role, user_id")
    .eq("id", input.membershipId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!target) return { error: "Member not found" };
  if (target.user_id === auth.user.id) {
    return { error: "You cannot change your own role" };
  }
  if (target.role === "owner" || input.role === "owner") {
    return { error: "Ownership can only change through Transfer ownership." };
  }
  if (!["manager", "staff"].includes(input.role)) {
    return { error: "Invalid role" };
  }

  // RLS (owner/platform admin only) and the organisation_members guard
  // trigger enforce the same rules for direct Data API calls.
  const { data: updated, error } = await auth.supabase
    .from("organisation_members")
    .update({ role: input.role })
    .eq("id", input.membershipId)
    .eq("organisation_id", input.organisationId)
    .select("id");

  if (error) return { error: error.message };
  if (!updated?.length) return { error: "Role was not changed" };

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "team.role_changed",
    entity_type: "organisation_members",
    entity_id: input.membershipId,
    metadata: { from: target.role, to: input.role, user_id: target.user_id },
  });

  revalidatePath("/app/settings");
  return { success: true };
}

/**
 * Hand the business to another existing member; the current owner becomes a
 * manager. Goes through the transfer_ownership RPC (current owner or platform
 * admin only), which is the only path the database allows for owner changes.
 */
export async function transferOwnership(input: {
  organisationId: string;
  membershipId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const { data: target } = await auth.supabase
    .from("organisation_members")
    .select("id, role, user_id")
    .eq("id", input.membershipId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!target) return { error: "Member not found" };
  if (target.user_id === auth.user.id) {
    return { error: "You are already the owner" };
  }

  const { error } = await auth.supabase.rpc("transfer_ownership", {
    p_organisation_id: input.organisationId,
    p_new_owner_user_id: target.user_id,
  });

  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  revalidatePath("/app", "layout");
  return { success: true };
}

export async function removeTeamMember(input: {
  organisationId: string;
  membershipId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    input.organisationId,
    ["owner"]
  );
  if (!membership) return { error: "Only owners can remove members" };

  const { data: target } = await auth.supabase
    .from("organisation_members")
    .select("id, role, user_id")
    .eq("id", input.membershipId)
    .eq("organisation_id", input.organisationId)
    .maybeSingle();

  if (!target) return { error: "Member not found" };
  if (target.user_id === auth.user.id) {
    return { error: "You cannot remove yourself" };
  }
  if (target.role === "owner") {
    return { error: "The owner cannot be removed. Transfer ownership first." };
  }

  const { data: removed, error } = await auth.supabase
    .from("organisation_members")
    .delete()
    .eq("id", input.membershipId)
    .eq("organisation_id", input.organisationId)
    .select("id");

  if (error) return { error: error.message };
  if (!removed?.length) return { error: "Member was not removed" };

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "team.member_removed",
    entity_type: "organisation_members",
    entity_id: input.membershipId,
    metadata: { role: target.role, user_id: target.user_id },
  });

  revalidatePath("/app/settings");
  return { success: true };
}

export async function revokeInvite(input: {
  organisationId: string;
  inviteId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  const allowed = await requireOwnerOrPlatformAdmin(
    auth.supabase,
    auth.user.id,
    input.organisationId
  );
  if (!allowed) return { error: "Only the owner can revoke invites" };

  const { data: revoked, error } = await auth.supabase
    .from("organisation_invites")
    .update({
      status: "revoked",
      revoked_at: new Date().toISOString(),
      revoked_by: auth.user.id,
    })
    .eq("id", input.inviteId)
    .eq("organisation_id", input.organisationId)
    .eq("status", "pending")
    .select("id, email");
  if (error) return { error: error.message };
  if (!revoked?.length) return { error: "No pending invite to revoke" };

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "team.invite_revoked",
    entity_type: "organisation_invites",
    entity_id: input.inviteId,
    metadata: { email: revoked[0].email, via: allowed.via },
  });

  revalidatePath("/app/settings");
  return { success: true };
}

export async function deleteOrganisation(input: {
  organisationId: string;
  confirmName: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    input.organisationId,
    ["owner"]
  );
  if (!membership) return { error: "Only owners can delete a business" };

  const { data: org } = await auth.supabase
    .from("organisations")
    .select("id, name")
    .eq("id", input.organisationId)
    .maybeSingle();

  if (!org) return { error: "Business not found" };
  if (org.name.trim() !== input.confirmName.trim()) {
    return { error: "Business name does not match. Deletion cancelled." };
  }

  const { error } = await auth.supabase
    .from("organisations")
    .delete()
    .eq("id", input.organisationId);

  if (error) return { error: error.message };

  // Switch to another org if available
  const { data: memberships } = await auth.supabase
    .from("organisation_members")
    .select("organisation_id")
    .eq("user_id", auth.user.id)
    .limit(1);

  if (memberships?.[0]?.organisation_id) {
    await setActiveOrganisationCookie(memberships[0].organisation_id);
  }

  revalidatePath("/", "layout");
  redirect(memberships?.[0] ? "/app" : "/app/onboarding");
}
