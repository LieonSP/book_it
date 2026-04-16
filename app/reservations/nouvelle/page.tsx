/**
 * app/reservations/nouvelle/page.tsx
 *
 * Server Component wrapper for the "Nouvelle réservation" form.
 *
 * WHY a Server Component wrapper:
 * The form itself is a Client Component (it manages state, handles events, and
 * calls Supabase browser client). But the user's role and identity need to be
 * fetched securely on the server — without this wrapper, the client would need
 * an extra round-trip to discover the role, causing a layout shift.
 *
 * This wrapper:
 * 1. Verifies the session (redirect to /login if missing)
 * 2. Fetches role + userId + firstName from public.users
 * 3. Passes them as props to the NouvelleReservationForm client component
 *
 * Both owner and provider roles may access this route.
 */

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { NouvelleReservationForm } from "./nouvelle-reservation-form"

export default async function NouvelleReservationPage() {
  // Create server-side Supabase client — reads the session from HTTP cookies
  const supabase = await createClient()

  // Validate session with a server round-trip (safer than getSession())
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No valid session → login
  if (!user) {
    redirect("/login")
  }

  // Fetch the minimum profile data needed to drive the form's role-based behaviour
  const { data: profile, error } = await supabase
    .from("users")
    .select("type, first_name")
    .eq("id", user.id)
    .single()

  // Misconfigured account → login
  if (error || !profile) {
    redirect("/login")
  }

  return (
    <NouvelleReservationForm
      userId={user.id}
      userRole={profile.type as "owner" | "provider"}
      firstName={profile.first_name}
    />
  )
}
