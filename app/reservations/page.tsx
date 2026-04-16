/**
 * app/reservations/page.tsx
 *
 * Shell page for the reservations section.
 *
 * This is a Server Component. It verifies the session and role server-side
 * (same pattern as /dashboard), then renders the header + title + CTA button.
 * The actual booking list is out of scope for this issue (Issue #36).
 *
 * Both owner and provider roles can access this page.
 */

import { redirect } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { LogoutButton } from "@/components/book-it/logout-button"
import { Button } from "@/components/book-it/button"

// ---------------------------------------------------------------------------
// All user-facing strings in one place for future i18n extraction
// ---------------------------------------------------------------------------

const LABELS = {
  pageTitle: "Réservations",
  newBookingButton: "Nouvelle réservation",
  emptyState: "Aucune réservation pour le moment.",
} as const

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function ReservationsPage() {
  // Create server-side Supabase client — reads session from cookies
  const supabase = await createClient()

  // getUser() validates the token with the Supabase server (more secure than getSession())
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Unauthenticated — redirect to login
  if (!user) {
    redirect("/login")
  }

  // Fetch the user's profile for the avatar letter in the header
  const { data: profile, error } = await supabase
    .from("users")
    .select("type, first_name")
    .eq("id", user.id)
    .single()

  // Missing profile means the account is misconfigured — send back to login
  if (error || !profile) {
    redirect("/login")
  }

  // BUG-004: use || not ?? so empty string "" also falls back to "?"
  const avatarLetter = profile.first_name?.charAt(0).toUpperCase() || "?"

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* ------------------------------------------------------------------ */}
      {/* Header — identical pattern to /dashboard                           */}
      {/* ------------------------------------------------------------------ */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo-transparent.png"
            alt="Book_it"
            width={32}
            height={32}
            className="rounded-sm"
            priority
          />
          <p className="text-sm font-semibold text-neutral-900">
            Book<span className="text-primary">_it</span>
          </p>
        </div>

        {/* Right side: avatar + logout icon */}
        <div className="flex items-center gap-1">
          {/* Avatar circle — first letter of the user's first name */}
          <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">{avatarLetter}</span>
          </div>
          {/* LogoutButton is a Client Component rendered inside this Server Component */}
          <LogoutButton />
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                         */}
      {/* ------------------------------------------------------------------ */}
      <main className="px-4 py-6 max-w-lg mx-auto">
        {/* Page title + CTA row */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-lg font-semibold text-neutral-900">
            {LABELS.pageTitle}
          </h1>
          {/*
           * Link wraps the Button so it acts as a navigation link.
           * asChild would require Radix — we use the Link+Button pattern
           * from the existing codebase instead.
           */}
          <Link href="/reservations/nouvelle">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              {LABELS.newBookingButton}
            </Button>
          </Link>
        </div>

        {/* Empty state placeholder — booking list is out of scope for Issue #36 */}
        <p className="text-sm text-neutral-500 text-center py-12">
          {LABELS.emptyState}
        </p>
      </main>
    </div>
  )
}
