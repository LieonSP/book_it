/**
 * app/page.tsx
 *
 * Root route — the "/" path.
 *
 * This is a Server Component that acts as an entry-point dispatcher.
 * It doesn't render any UI of its own — it just checks whether the user
 * is authenticated and sends them to the right place:
 *
 * - Authenticated  → /dashboard  (their home screen)
 * - Not authenticated → /login  (they need to sign in first)
 *
 * WHY do this here instead of relying on middleware alone?
 * Middleware handles protected routes (e.g., blocking /dashboard without a session).
 * This root redirect gives "/" a clear, intentional destination rather than
 * leaving it as the default Next.js placeholder page.
 */

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"

export default async function RootPage() {
  // Create the server-side Supabase client to read the auth session from cookies
  const supabase = await createClient()

  // getUser() validates the session token with Supabase's server.
  // We don't use getSession() here because it trusts the cookie without re-validating.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (user) {
    // User has a valid session — send them straight to their dashboard
    redirect("/dashboard")
  } else {
    // No session — they need to log in first
    redirect("/login")
  }
}
