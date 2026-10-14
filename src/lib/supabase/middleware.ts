import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "@/lib/database.types"
import {
  getSupabasePublishableKey,
  getSupabaseUrl,
} from "@/lib/supabase/env"

function nextWithPathname(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-pathname", request.nextUrl.pathname)
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = nextWithPathname(request)

  const supabase = createServerClient<Database>(
    getSupabaseUrl(),
    getSupabasePublishableKey(),
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = nextWithPathname(request)
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Refresh session / validate JWT — do not remove.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  const { pathname } = request.nextUrl

  const isAppRoute = pathname.startsWith("/app")
  const isPlatformRoute = pathname.startsWith("/platform")
  // Signed-in users skip these. (/reset-password and /invite/* need a
  // session, so they are not listed.)
  const isAuthPage = pathname === "/login" || pathname === "/forgot-password"

  if ((isAppRoute || isPlatformRoute) && !user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  if (isAuthPage && user) {
    const url = request.nextUrl.clone()
    url.pathname = "/app"
    url.search = ""
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
