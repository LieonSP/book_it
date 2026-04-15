"use client"

/**
 * components/book-it/logout-button.tsx
 *
 * A client component that signs the current user out of Supabase Auth
 * and redirects them to the login page.
 *
 * WHY this is a Client Component:
 * signOut() must run in the browser — it clears the session cookies and
 * BroadcastChannel state managed by @supabase/ssr. The server client
 * cannot perform a client-side sign-out, so we explicitly use the
 * browser client from @/lib/supabase/client.
 *
 * WHY we use useRouter for the redirect instead of window.location:
 * useRouter from next/navigation integrates with Next.js's client-side
 * router, ensuring a clean navigation event without a full page reload.
 * It also respects any route prefetching that may already be in flight.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, Loader2 } from "lucide-react"
import { createClient } from "@/lib/supabase/client"

// ---------------------------------------------------------------------------
// String constants — grouped here to make future i18n extraction easy
// ---------------------------------------------------------------------------

const STRINGS = {
  /** aria-label on the button — describes the action to screen readers */
  ariaLabel: "Se déconnecter",
} as const

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * LogoutButton
 *
 * Renders a small icon button in the header that signs the user out.
 * While the sign-out is in flight, the icon swaps to a spinner and the
 * button is disabled to prevent double-clicks.
 *
 * On success  → navigate to /login
 * On failure  → log the error to the console, reset to idle (stay on page)
 */
export function LogoutButton() {
  // isPending tracks whether a sign-out request is currently in progress.
  // We use local state (not a form action) because this is a simple async
  // operation that does not involve any form submission.
  const [isPending, setIsPending] = useState(false)

  // useRouter gives us programmatic navigation without a full page reload.
  const router = useRouter()

  /**
   * handleLogout
   *
   * Called when the user taps the logout icon.
   * Steps:
   * 1. Set isPending = true to show the spinner and disable the button
   * 2. Call supabase.auth.signOut() to invalidate the session
   * 3. On success, navigate to /login
   * 4. On failure, log the error and reset isPending so the user can retry
   */
  async function handleLogout() {
    // Prevent double-submissions if the user taps rapidly
    if (isPending) return

    setIsPending(true)

    // We use the browser client here because signOut() must run client-side —
    // the server client cannot clear browser cookies or the BroadcastChannel
    // session state that @supabase/ssr maintains in the browser.
    const supabase = createClient()
    const { error } = await supabase.auth.signOut()

    if (error) {
      // Log the error but stay on the page — the session may still be valid.
      // Resetting isPending lets the user try again.
      console.error("[LogoutButton] supabase.auth.signOut() failed:", error)
      setIsPending(false)
      return
    }

    // Sign-out succeeded — navigate to the login page.
    // We do NOT reset isPending here: we want the spinner to stay visible
    // during the navigation so there is no flicker back to the icon.
    router.push("/login")
  }

  return (
    <button
      onClick={handleLogout}
      disabled={isPending}
      className="h-11 w-11 flex items-center justify-center rounded-lg text-neutral-500 hover:text-error hover:bg-error-light transition-colors disabled:opacity-50"
      aria-label={STRINGS.ariaLabel}
    >
      {/*
       * Show a spinning loader while the sign-out request is in flight.
       * This gives the user clear feedback that something is happening
       * and prevents them from thinking the tap was missed.
       */}
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
    </button>
  )
}
