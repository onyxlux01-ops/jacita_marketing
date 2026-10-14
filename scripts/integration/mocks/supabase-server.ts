// Mock of "@/lib/supabase/server": returns the acting test user's real,
// RLS-bound Supabase client instead of reading Next.js request cookies.
import { itest } from "../state";

export function hasSupabaseEnv() {
  return true;
}

export async function createClient() {
  if (!itest.userClient) {
    throw new Error("[itest] no acting user: call actAs(user) first");
  }
  return itest.userClient as never;
}
