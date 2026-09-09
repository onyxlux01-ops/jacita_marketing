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

export async function inviteTeamMember(input: {
  organisationId: string;
  email: string;
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
  if (!membership) return { error: "Only owners can invite team members" };

  const email = input.email.trim().toLowerCase();
  if (!email.includes("@")) return { error: "Enter a valid email" };
  if (!["manager", "staff", "owner"].includes(input.role)) {
    return { error: "Invalid role" };
  }

  const role: OrgRole = input.role === "owner" ? "manager" : input.role;
  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

  // Try to resolve existing auth user via service role (email lives on auth.users)
  let existingUserId: string | null = null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: listed } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    const match = listed.users.find(
      (u) => u.email?.toLowerCase() === email
    );
    existingUserId = match?.id ?? null;
  } catch {
    existingUserId = null;
  }

  if (existingUserId) {
    const { data: existingMember } = await auth.supabase
      .from("organisation_members")
      .select("id")
      .eq("organisation_id", input.organisationId)
      .eq("user_id", existingUserId)
      .maybeSingle();
    if (existingMember) return { error: "This user is already a member" };
  }

  const { error } = await auth.supabase.from("organisation_invites").insert({
    organisation_id: input.organisationId,
    email,
    role,
    invited_by: auth.user.id,
    token,
    status: "pending",
    expires_at: expiresAt,
  });

  if (error) return { error: error.message };

  if (existingUserId) {
    await auth.supabase.from("organisation_members").insert({
      organisation_id: input.organisationId,
      user_id: existingUserId,
      role,
    });
    await auth.supabase
      .from("organisation_invites")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
        accepted_user_id: existingUserId,
      })
      .eq("token", token);
  }

  await auth.supabase.from("audit_logs").insert({
    organisation_id: input.organisationId,
    user_id: auth.user.id,
    action: "team.invited",
    entity_type: "organisation_invites",
    metadata: { email, role },
  });

  revalidatePath("/app/settings");
  return {
    success: true,
    pending: !existingUserId,
    message: existingUserId
      ? "Member added"
      : "Invite saved. They will be linked when they join with this email.",
  };
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
  if (target.role === "owner") {
    return { error: "Cannot change another owner's role here" };
  }

  const { error } = await auth.supabase
    .from("organisation_members")
    .update({ role: input.role === "owner" ? "manager" : input.role })
    .eq("id", input.membershipId);

  if (error) return { error: error.message };
  revalidatePath("/app/settings");
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
    return { error: "Cannot remove another owner" };
  }

  const { error } = await auth.supabase
    .from("organisation_members")
    .delete()
    .eq("id", input.membershipId)
    .eq("organisation_id", input.organisationId);

  if (error) return { error: error.message };
  revalidatePath("/app/settings");
  return { success: true };
}

export async function revokeInvite(input: {
  organisationId: string;
  inviteId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };
  const membership = await requireManage(
    auth.supabase,
    auth.user.id,
    input.organisationId,
    ["owner"]
  );
  if (!membership) return { error: "Only owners can revoke invites" };

  await auth.supabase
    .from("organisation_invites")
    .update({ status: "revoked" })
    .eq("id", input.inviteId)
    .eq("organisation_id", input.organisationId);

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
