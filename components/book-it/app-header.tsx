"use client"

/**
 * components/book-it/app-header.tsx
 *
 * AppHeader — the shared top bar rendered on every authenticated screen.
 *
 * WHY a shared component:
 * The header (logo + app name + avatar + logout) is duplicated across several
 * pages. Centralising it avoids drift and makes navigation behaviour consistent
 * everywhere without touching four separate files each time.
 *
 * TWO VISUAL STATES:
 * 1. Dashboard state (/dashboard): logo image + "Book_it" text on the left.
 *    No navigation arrow — this IS the home screen.
 * 2. Sub-page state (all other authenticated routes): a back-arrow chevron on
 *    the left, page title centred in the header, avatar + logout stay on right.
 *
 * WHY we use router.push() instead of router.back():
 * router.back() relies on the browser history stack. If a user lands on a
 * sub-page via a direct link (e.g. a bookmark), the back stack might be empty
 * or point to an unrelated page. router.push() with a hardcoded parent map is
 * deterministic and predictable regardless of how the user arrived.
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
import { ChevronLeft } from "lucide-react"
import { LogoutButton } from "./logout-button"

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface AppHeaderProps {
  /** One character shown in the circular avatar (e.g. "P" for Philippe). */
  avatarLetter: string
}

// ---------------------------------------------------------------------------
// Navigation maps
// ---------------------------------------------------------------------------

/**
 * PARENT_ROUTES maps each static sub-page to the page it should go back to.
 * We keep this explicit rather than using router.back() so the destination is
 * always predictable even if the user arrived via a direct link.
 *
 * The dynamic route /reservations/[id]/modifier is handled separately below
 * with a regex match because the [id] segment is unknown at compile time.
 */
const PARENT_ROUTES: Record<string, string> = {
  "/reservations": "/dashboard",
  "/reservations/nouvelle": "/reservations",
  "/synthese": "/dashboard",
}

/**
 * PAGE_TITLES maps each static sub-page to its human-readable French title.
 * The title is displayed centred in the header when the back-arrow state is active.
 *
 * The dynamic route /reservations/[id]/modifier is handled separately below.
 */
const PAGE_TITLES: Record<string, string> = {
  "/reservations": "Réservations",
  "/reservations/nouvelle": "Nouvelle réservation",
  "/synthese": "Synthèse mensuelle",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function AppHeader({ avatarLetter }: AppHeaderProps) {
  // usePathname gives us the current URL path without the query string.
  // This is a client-side hook — that's why this file has "use client".
  const pathname = usePathname()
  const router   = useRouter()

  // -------------------------------------------------------------------------
  // Determine which visual state to render
  // -------------------------------------------------------------------------

  // True when the user is on the home dashboard — logo state.
  const isOnDashboard = pathname === "/dashboard"

  // Check for the dynamic modifier route: /reservations/<any-id>/modifier
  // We use a regex because the [id] segment is a UUID we can't hardcode.
  const isModifierRoute = /^\/reservations\/[^/]+\/modifier$/.test(pathname)

  // Resolve the page title for the current route.
  // Static routes use the map; the dynamic modifier route gets a hardcoded title.
  const pageTitle: string | null = isModifierRoute
    ? "Modifier réservation"
    : (PAGE_TITLES[pathname] ?? null)

  // Resolve the parent route to navigate to when the back arrow is tapped.
  // Static routes use the map; the dynamic modifier route always goes to /reservations.
  const parentRoute: string | null = isModifierRoute
    ? "/reservations"
    : (PARENT_ROUTES[pathname] ?? null)

  /**
   * handleBackClick — navigate to the logical parent of the current page.
   *
   * WHY we guard with parentRoute:
   * If this component is ever rendered on a route not in our maps (future-proofing),
   * we do nothing rather than crashing or navigating to an unexpected page.
   */
  function handleBackClick() {
    if (parentRoute) {
      // router.push() adds a new entry to the history stack and performs a
      // client-side navigation — no full page reload, no flash.
      router.push(parentRoute)
    }
  }

  // -------------------------------------------------------------------------
  // RENDER — Dashboard state
  // -------------------------------------------------------------------------

  if (isOnDashboard) {
    // On /dashboard, we show the original logo + app name. No back arrow.
    // The left slot is a non-interactive element (disabled button) because
    // clicking the logo while already on /dashboard should do nothing.
    return (
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">

        {/* -----------------------------------------------------------------
            Left side: logo + app name (inert on /dashboard).
            Disabled so screen readers don't announce a clickable action that
            does nothing.
            ----------------------------------------------------------------- */}
        <button
          type="button"
          disabled
          // cursor-default signals that this is not an interactive element.
          className="flex items-center gap-2.5 rounded cursor-default focus:outline-none"
          aria-label="Book_it — tableau de bord"
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
            Right side: avatar circle + logout button (unchanged).
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

  // -------------------------------------------------------------------------
  // RENDER — Sub-page state (back arrow + centred title)
  // -------------------------------------------------------------------------

  // WHY `relative` on the header:
  // The page title is positioned absolutely inside the header so it is truly
  // centred relative to the full header width — not centred between the button
  // and the right-slot controls. `relative` on the parent establishes the
  // positioning context for `absolute inset-0`.
  //
  // WHY `pointer-events-none` on the title div:
  // The title div spans the entire header (via `inset-0`). Without
  // `pointer-events-none` it would sit on top of the back button and the
  // right-slot controls, silently swallowing their tap events on mobile.
  return (
    <header className="relative flex items-center px-4 py-3 border-b border-neutral-200 bg-white min-h-[56px]">

      {/* -------------------------------------------------------------------
          Left side: back arrow button.
          44×44px touch target (h-11 w-11) as per Apple HIG / WCAG 2.5.5
          for comfortable one-thumb tapping on mobile.
          -ml-1.5 compensates for the button's padding so the icon visually
          aligns with the left edge of the content area.
          ------------------------------------------------------------------- */}
      {parentRoute ? (
        <button
          type="button"
          onClick={handleBackClick}
          className="flex items-center justify-center h-11 w-11 -ml-1.5 rounded-lg text-primary hover:bg-primary-light transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Retour à la page précédente"
        >
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>
      ) : (
        // Edge case: route not in map — render an empty placeholder so the
        // right slot stays correctly aligned without crashing.
        <div className="h-11 w-11 -ml-1.5" aria-hidden="true" />
      )}

      {/* -------------------------------------------------------------------
          Centre: page title — absolutely positioned so it is centred relative
          to the full header width, independent of left/right slot widths.
          pointer-events-none ensures tap events pass through to the elements
          underneath (back button, avatar, logout).
          ------------------------------------------------------------------- */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className="text-sm font-semibold text-neutral-900">{pageTitle}</span>
      </div>

      {/* -------------------------------------------------------------------
          Right side: avatar circle + logout button (unchanged from dashboard).
          ml-auto pushes this slot to the far right regardless of what the
          left slot contains.
          ------------------------------------------------------------------- */}
      <div className="ml-auto flex items-center gap-1">
        {/* Avatar — coloured circle with the first letter of the user's name */}
        <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
          <span className="text-xs font-semibold text-primary">{avatarLetter}</span>
        </div>

        {/*
         * LogoutButton is a Client Component that calls supabase.auth.signOut()
         * and then redirects to /login.
         */}
        <LogoutButton />
      </div>

    </header>
  )
}
