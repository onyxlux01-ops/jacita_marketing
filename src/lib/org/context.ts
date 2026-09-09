import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import type { Organisation, OrgRole, Tables } from "@/lib/database.types"
import { ACTIVE_ORG_COOKIE } from "@/lib/org/constants"
import { createClient } from "@/lib/supabase/server"

export type SessionUser = {
  id: string
  email?: string
}

export type UserOrganisation = Organisation & {
  role: OrgRole
  membership_id: string
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient()

  const { data: claimsData } = await supabase.auth.getClaims()
  const sub = claimsData?.claims?.sub

  if (typeof sub === "string" && sub.length > 0) {
    const email =
      typeof claimsData?.claims?.email === "string"
        ? claimsData.claims.email
        : undefined
    return { id: sub, email }
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  return {
    id: user.id,
    email: user.email,
  }
}

export async function getUserOrganisations(
  userId: string
): Promise<UserOrganisation[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("organisation_members")
    .select(
      `
      id,
      role,
      organisations (*)
    `
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: true })

  if (error || !data) {
    return []
  }

  type MembershipRow = {
    id: string
    role: OrgRole
    organisations: Organisation | Organisation[] | null
  }

  return (data as MembershipRow[])
    .map((row) => {
      const org = Array.isArray(row.organisations)
        ? row.organisations[0]
        : row.organisations
      if (!org) return null
      return {
        ...org,
        role: row.role,
        membership_id: row.id,
      } satisfies UserOrganisation
    })
    .filter((org): org is UserOrganisation => org !== null)
}

export async function getActiveOrganisationId(
  userId?: string
): Promise<string | null> {
  const user = userId
    ? { id: userId }
    : await getSessionUser()

  if (!user) return null

  const orgs = await getUserOrganisations(user.id)
  if (orgs.length === 0) return null

  const cookieStore = await cookies()
  const cookieOrgId = cookieStore.get(ACTIVE_ORG_COOKIE)?.value

  if (cookieOrgId && orgs.some((org) => org.id === cookieOrgId)) {
    return cookieOrgId
  }

  return orgs[0]?.id ?? null
}

export async function getActiveOrganisation(
  userId?: string
): Promise<UserOrganisation | null> {
  const user = userId
    ? { id: userId }
    : await getSessionUser()

  if (!user) return null

  const orgs = await getUserOrganisations(user.id)
  const activeId = await getActiveOrganisationId(user.id)

  if (!activeId) return null

  return orgs.find((org) => org.id === activeId) ?? null
}

export async function requireActiveOrganisation(): Promise<{
  user: SessionUser
  organisation: UserOrganisation
}> {
  const user = await getSessionUser()
  if (!user) {
    redirect("/login")
  }

  const organisation = await getActiveOrganisation(user.id)
  if (!organisation) {
    redirect("/app/onboarding")
  }

  return { user, organisation }
}

export async function setActiveOrganisationCookie(orgId: string) {
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_ORG_COOKIE, orgId, {
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  })
}

export type Membership = Tables<"organisation_members">
