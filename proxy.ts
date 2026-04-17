/**
 * proxy.ts
 *
 * Next.js 16+ proxy (formerly middleware) runs on every matching request,
 * before the page renders. We use it here for two purposes:
 *
 * 1. PROTECT authenticated routes: if the user visits /dashboard (or any sub-path)
 *    without a valid session, redirect them to /login.
 *
 * 2. REDIRECT logged-in users away from /login: if an already-authenticated user
 *    navigates to /login, send them straight to /dashboard so they skip the form.
 *
 * WHY proxy instead of page-level redirects:
 * Proxy runs at the edge before any React code executes, so redirects happen
 * instantly without a flash of the wrong page. It also ensures the protection
 * can't be bypassed by navigating directly to a URL.
 *
 * WHY we need a Supabase client here:
 * The session lives in an HTTP-only cookie. Proxy must use @supabase/ssr's
 * createServerClient to read that cookie (it can't use the browser client).
 * We also call getUser() rather than getSession() because getUser() validates
 * the token with the Supabase server — getSession() trusts the cookie blindly.
 */

import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

export async function proxy(request: NextRequest) {
  // We build the response object upfront so we can attach updated auth cookies to it.
  // Supabase may rotate the session token silently — we need to propagate those new
  // cookies to the client even on redirect responses.
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          // First write cookies onto the request (so the current handler can see them)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          // Then rebuild the response so the updated cookies are sent to the browser
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getUser() makes a round-trip to Supabase to verify the token is still valid.
  // This is more secure than getSession() which trusts the cookie without verification.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Rule 1: Unauthenticated user trying to access a protected route → send to /login
  if (!user && pathname.startsWith("/dashboard")) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = "/login"
    return NextResponse.redirect(loginUrl)
  }

  // Rule 2: Authenticated user visiting /login → send to /dashboard (already logged in)
  if (user && pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = "/dashboard"
    return NextResponse.redirect(dashboardUrl)
  }

  // No redirect needed — pass the request through with any updated auth cookies
  return supabaseResponse
}

/**
 * The matcher controls which paths proxy actually runs on.
 * We exclude static files and Next.js internals for performance —
 * they don't need auth checks and running proxy on them wastes time.
 */
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
