"use server";

import { revalidatePath } from "next/cache";
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server";
import {
  approveAndExecuteAdvertisingAction,
  ensureAdvertisingSettings,
  getMetaSurfaceForOrganisation,
  proposeAdvertisingAction,
  rejectAdvertisingAction,
  updateAdvertisingSettings,
  type AdvertisingActionType,
} from "@/lib/ads/service";

async function getAuthed() {
  if (!hasSupabaseEnv()) return { error: "Supabase is not configured" as const };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" as const };
  return { supabase, user };
}

export async function getMetaAdvertisingSurface(organisationId: string) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const { data: membership } = await auth.supabase
    .from("organisation_members")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (!membership) {
    return { error: "Unauthorized for this business" as const };
  }

  await ensureAdvertisingSettings(organisationId);
  const surface = await getMetaSurfaceForOrganisation(organisationId);
  return { success: true as const, surface };
}

export async function proposeMetaAdAction(input: {
  organisationId: string;
  actionType: AdvertisingActionType;
  payload: Record<string, unknown>;
  metaAdAccountId?: string | null;
  asAi?: boolean;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const result = await proposeAdvertisingAction({
    organisationId: input.organisationId,
    userId: auth.user.id,
    actionType: input.actionType,
    payload: input.payload,
    metaAdAccountId: input.metaAdAccountId,
    proposedBy: input.asAi ? "ai" : "user",
  });

  revalidatePath("/app/automation");
  return result;
}

export async function approveMetaAdAction(input: {
  organisationId: string;
  actionId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const result = await approveAndExecuteAdvertisingAction({
    organisationId: input.organisationId,
    userId: auth.user.id,
    actionId: input.actionId,
  });

  revalidatePath("/app/automation");
  revalidatePath("/app/social");
  return result;
}

export async function rejectMetaAdAction(input: {
  organisationId: string;
  actionId: string;
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const result = await rejectAdvertisingAction({
    organisationId: input.organisationId,
    userId: auth.user.id,
    actionId: input.actionId,
  });

  revalidatePath("/app/automation");
  return result;
}

export async function saveAdvertisingLimits(input: {
  organisationId: string;
  dailySpendLimitCents: number;
  maxActiveCampaigns: number;
  emergencyStopped?: boolean;
  mode?: "off" | "approval";
}) {
  const auth = await getAuthed();
  if ("error" in auth) return { error: auth.error };

  const result = await updateAdvertisingSettings({
    organisationId: input.organisationId,
    userId: auth.user.id,
    dailySpendLimitCents: input.dailySpendLimitCents,
    maxActiveCampaigns: input.maxActiveCampaigns,
    emergencyStopped: input.emergencyStopped,
    mode: input.mode,
  });

  revalidatePath("/app/automation");
  return result;
}

/** Convenience: propose + (for read-only) may still require approval */
export async function discoverMetaAdAccounts(organisationId: string) {
  return proposeMetaAdAction({
    organisationId,
    actionType: "DISCOVER_AD_ACCOUNTS",
    payload: {},
  });
}

export async function linkMetaAdAccount(input: {
  organisationId: string;
  externalAdAccountId: string;
}) {
  const proposed = await proposeMetaAdAction({
    organisationId: input.organisationId,
    actionType: "LINK_AD_ACCOUNT",
    payload: { externalAdAccountId: input.externalAdAccountId },
  });
  if ("error" in proposed || !("action" in proposed)) return proposed;

  // Linking requires explicit human approval like other mutations
  return {
    success: true as const,
    requiresApproval: true,
    actionId: proposed.action.id as string,
  };
}
