import type { Organisation } from "@/lib/database.types"
import { ACTIVE_ORG_COOKIE } from "@/lib/org/constants"
import {
  getActiveOrganisation as getActiveOrganisationFromContext,
  getSessionUser as getSessionUserBase,
  getUserOrganisations as getUserOrganisationsForUser,
  setActiveOrganisationCookie,
  type SessionUser,
  type UserOrganisation,
} from "@/lib/org/context"
import { createClient, hasSupabaseEnv } from "@/lib/supabase/server"

export { ACTIVE_ORG_COOKIE } from "@/lib/org/constants"
export {
  setActiveOrganisationCookie,
  requireActiveOrganisation,
  getActiveOrganisationId,
} from "@/lib/org/context"
export { getSetupProgress, ONBOARDING_STEPS, BRAND_VOICE_OPTIONS } from "@/lib/org/setup-progress"
export type { SetupProgress, OnboardingStep } from "@/lib/org/setup-progress"
export type { SessionUser, UserOrganisation }

export type OrganisationSummary = Pick<
  Organisation,
  "id" | "name" | "slug" | "business_category" | "status" | "location"
>

export type AppUser = SessionUser & {
  full_name: string | null
  avatar_url: string | null
  is_platform_admin: boolean
}

export async function getSessionUser(): Promise<AppUser | null> {
  if (!hasSupabaseEnv()) return null

  try {
    const base = await getSessionUserBase()
    if (!base) return null

    const supabase = await createClient()
    const { data: profile } = await supabase
      .from("users")
      .select("full_name, avatar_url, is_platform_admin")
      .eq("id", base.id)
      .maybeSingle()

    return {
      ...base,
      full_name: profile?.full_name ?? null,
      avatar_url: profile?.avatar_url ?? null,
      is_platform_admin: profile?.is_platform_admin ?? false,
    }
  } catch {
    return null
  }
}

export async function getUserOrganisations(): Promise<OrganisationSummary[]> {
  if (!hasSupabaseEnv()) return []

  try {
    const user = await getSessionUserBase()
    if (!user) return []

    const orgs = await getUserOrganisationsForUser(user.id)
    return orgs.map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      business_category: org.business_category,
      status: org.status,
      location: org.location,
    }))
  } catch {
    return []
  }
}

export async function getActiveOrganisation(
  orgs?: OrganisationSummary[]
): Promise<OrganisationSummary | null> {
  if (orgs) {
    if (orgs.length === 0) return null
    try {
      const active = await getActiveOrganisationFromContext()
      if (active) {
        const match = orgs.find((o) => o.id === active.id)
        if (match) return match
      }
    } catch {
      // fall through
    }
    return orgs[0]
  }

  if (!hasSupabaseEnv()) return null

  try {
    const active = await getActiveOrganisationFromContext()
    if (!active) return null
    return {
      id: active.id,
      name: active.name,
      slug: active.slug,
      business_category: active.business_category,
      status: active.status,
      location: active.location,
    }
  } catch {
    return null
  }
}
