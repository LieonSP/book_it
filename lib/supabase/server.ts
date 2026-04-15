/**
 * lib/supabase/server.ts
 *
 * Creates a Supabase client for use in Server Components, Server Actions,
 * and Route Handlers (i.e., code that runs on the server, not in the browser).
 *
 * WHY cookies-based session management:
 * The browser can't store Supabase tokens in localStorage when running on the server.
 * Instead, @supabase/ssr reads and writes the session tokens from HTTP cookies,
 * which are available on both server and client and persist across page loads.
 *
 * This function is async because Next.js 15 requires awaiting cookies().
 */

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

export async function createClient() {
  // Await the cookie store — required in Next.js 15 App Router
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Read all cookies from the request — Supabase picks out the auth token
        getAll() {
          return cookieStore.getAll()
        },
        // Write auth cookies back to the response (e.g., after session refresh)
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll can throw when called from a read-only Server Component context.
            // This is safe to ignore — the middleware handles cookie refreshes instead.
          }
        },
      },
    }
  )
}
