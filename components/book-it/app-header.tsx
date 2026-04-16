"use client"

/**
 * components/book-it/app-header.tsx
 *
 * AppHeader — the shared top bar rendered on every authenticated screen.
 *
 * WHY a shared component:
 * The header (logo + app name + avatar + logout) is duplicated across several
 * pages. Centralising it avoids drift and makes the "click logo → go home"
 * behaviour consistent everywhere without touching four separate files each time.
 *
 * CLICK-HOME BEHAVIOUR (issue #45):
 * - On any authenticated page that is NOT /dashboard, clicking the logo/name
 *   navigates to /dashboard.
 * - On /dashboard itself, the click does nothing — no navigation, no reload.
 *   We guard this with a pathname check so the user never gets an unnecessary
 *   re-render or a full page reload.
 *
 * LOGIN PAGE:
 * This component is never rendered on /login. The login page has its own
 * static logo (no link, no navigation) because the user is not authenticated.
 *
 * PROPS:
 * - avatarLetter: single uppercase character shown in the avatar circle.
 *   Pass profile.first_name?.charAt(0).toUpperCase() || "?" from the parent.
 */

import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { LogoutButton } from "./logout-button"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppHeaderProps {
  /** One character shown in the circular avatar (e.g. "P" for Philippe). */
  avatarLetter: string
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppHeader({ avatarLetter }: AppHeaderProps) {
  // usePathname gives us the current URL path without the query string.
  // This is a client-side hook — that's why this file has "use client".
  const pathname = usePathname()
  const router   = useRouter()

  /**
   * handleLogoClick — navigate to /dashboard, but only when we're not
   * already there.
   *
   * WHY we check pathname first:
   * Calling router.push("/dashboard") from /dashboard would create a new
   * history entry and cause a re-render even though the user is already
   * on the target page. The check costs nothing and avoids that noise.
   */
  function handleLogoClick() {
    if (pathname !== "/dashboard") {
      router.push("/dashboard")
    }
    // If already on /dashboard, do nothing — no navigation, no scroll-to-top,
    // no unnecessary re-render.
  }

  // On /dashboard, the logo is decorative — no cursor change, no pointer feedback.
  // On any other page, it's interactive — show a pointer cursor.
  const isOnDashboard = pathname === "/dashboard"

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">

      {/* -----------------------------------------------------------------
          Left side: logo + app name.
          The entire left block is a button so the tap target on mobile
          covers both the image and the text (easier to tap than the logo alone).
          aria-label describes the action for screen readers.
          When already on /dashboard the aria-label changes to reflect
          that it's inert.
          ----------------------------------------------------------------- */}
      <button
        type="button"
        onClick={handleLogoClick}
        // Disable pointer cursor on /dashboard to signal the button is inert.
        className={[
          "flex items-center gap-2.5 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isOnDashboard ? "cursor-default" : "cursor-pointer",
        ].join(" ")}
        aria-label={isOnDashboard ? "Book_it — tableau de bord" : "Retour au tableau de bord"}
        // On /dashboard, disable the button semantically so assistive technology
        // does not announce a clickable action that does nothing.
        disabled={isOnDashboard}
      >
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
      </button>

      {/* -----------------------------------------------------------------
          Right side: avatar circle + logout button.
          ----------------------------------------------------------------- */}
      <div className="flex items-center gap-1">
        {/* Avatar — coloured circle with the first letter of the user's name */}
        <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">{avatarLetter}</span>
        </div>

        {/*
         * LogoutButton is a Client Component that calls supabase.auth.signOut()
         * and then redirects to /login. Rendering it here keeps logout available
         * on every authenticated screen.
         */}
        <LogoutButton />
      </div>

    </header>
  )
}
