/**
 * app/dashboard/page.tsx
 *
 * The main dashboard — the home screen users see after logging in.
 *
 * This is a Server Component (no "use client" directive) so it can:
 * - Read the session from cookies on the server (no client-side flicker)
 * - Query public.users for the role without exposing the query to the browser
 * - Redirect immediately if the user isn't authenticated
 *
 * WHY we check the role server-side:
 * RLS protects the data, but we also want to render different UI depending on
 * whether the user is an owner or a provider. Doing this on the server means the
 * user never briefly sees the wrong dashboard before a client-side redirect kicks in.
 *
 * Layout:
 * - Header with logo + user avatar (first letter of first name)
 * - Grid of navigation cards — owners see 4, providers see 1
 * - Each card links to a feature section of the app
 */

import { redirect } from "next/navigation"
import Image from "next/image"
import Link from "next/link"
import { CalendarDays, Building2, Users, BarChart2, ChevronRight } from "lucide-react"
import { createClient } from "@/lib/supabase/server"
import { Card } from "@/components/book-it/card"

// ---------------------------------------------------------------------------
// Type definitions
// ---------------------------------------------------------------------------

/** The two roles our app supports — matches the enum in public.users */
type UserType = "owner" | "provider"

/** Shape of each navigation card shown on the dashboard */
interface NavCard {
  label: string
  href: string
  /** Lucide icon component */
  Icon: React.ElementType
}

// ---------------------------------------------------------------------------
// Navigation card definitions per role
// ---------------------------------------------------------------------------

/** Cards shown to property owners — they manage listings, providers, and summaries */
const OWNER_CARDS: NavCard[] = [
  { label: "Réservations", href: "/reservations", Icon: CalendarDays },
  { label: "Propriétés",   href: "/proprietes",   Icon: Building2 },
  { label: "Prestataires", href: "/prestataires",  Icon: Users },
  { label: "Synthèse",     href: "/synthese",      Icon: BarChart2 },
]

/** Cards shown to service providers — they only manage their own bookings */
const PROVIDER_CARDS: NavCard[] = [
  { label: "Réservations", href: "/reservations", Icon: CalendarDays },
]

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  // Create the server-side Supabase client — reads the session from cookies
  const supabase = await createClient()

  // Verify the session. We use getUser() (not getSession()) because getUser()
  // validates the token with the Supabase server. getSession() trusts the cookie
  // blindly and could be spoofed with a stale or tampered token.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // No valid session — send to login
  if (!user) {
    redirect("/login")
  }

  // Fetch the user's profile from public.users.
  // RLS ensures this SELECT only returns the row where id = auth.uid(),
  // so a user can never read another user's profile.
  const { data: profile, error } = await supabase
    .from("users")
    .select("type, first_name")
    .eq("id", user.id)
    .single()

  // If no profile row exists, the account is misconfigured — redirect to login
  if (error || !profile) {
    redirect("/login")
  }

  const userType = profile.type as UserType

  // Pick the correct set of nav cards based on the user's role
  const cards = userType === "owner" ? OWNER_CARDS : PROVIDER_CARDS

  // The first letter of the user's first name for the avatar circle
  const avatarLetter = profile.first_name?.charAt(0).toUpperCase() || "?"

  return (
    // min-h-screen ensures the page fills the viewport on all screen sizes
    <div className="min-h-screen bg-neutral-50">

      {/* ------------------------------------------------------------------ */}
      {/* Header — logo on the left, user avatar on the right                */}
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

        {/* Avatar — a coloured circle showing the first letter of the user's name */}
        <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">
            {avatarLetter}
          </span>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* Main content — greeting + navigation cards                          */}
      {/* ------------------------------------------------------------------ */}
      <main className="px-4 py-6">
        {/* Greeting — tells the user they're in the right place */}
        <h1 className="text-lg font-semibold text-neutral-900 mb-6">
          Bonjour, {profile.first_name} 👋
        </h1>

        {/* Navigation cards — stacked on mobile, 2-column grid on medium+ screens */}
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2">
          {cards.map(({ label, href, Icon }) => (
            <Link key={href} href={href} className="block">
              {/* Card is the design-system surface — adds border, shadow, rounded corners */}
              <Card className="flex items-center justify-between px-4 py-4 hover:bg-neutral-50 transition-colors">
                <div className="flex items-center gap-3">
                  {/* Icon in a coloured circle — visual anchor for each section */}
                  <div className="h-10 w-10 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm font-semibold text-neutral-900">
                    {label}
                  </span>
                </div>

                {/* ChevronRight signals this is a navigation link, not just a display card */}
                <ChevronRight className="h-4 w-4 text-neutral-500 flex-shrink-0" />
              </Card>
            </Link>
          ))}
        </div>
      </main>
    </div>
  )
}
