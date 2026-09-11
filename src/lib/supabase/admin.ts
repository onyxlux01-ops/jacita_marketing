import "server-only"

import { createClient } from "@supabase/supabase-js"

import type { Database } from "@/lib/database.types"
import { getSupabaseUrl } from "@/lib/supabase/env"

/**
 * Service-role client for privileged server-only operations (e.g. seeding).
 * Never import this module from Client Components or expose the key publicly.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY")
  }

  return createClient<Database>(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
