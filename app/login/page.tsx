"use client"

/**
 * app/login/page.tsx
 *
 * The login page — the entry point for all users.
 *
 * This is a Client Component ("use client") because it handles user interaction:
 * typing in the form, clicking the button, and showing an error message without
 * reloading the page. Server Components can't do any of that.
 *
 * Flow:
 * 1. User fills in email + password and clicks "Se connecter"
 * 2. We call Supabase Auth to validate the credentials
 * 3. On success, we read the user's role from public.users
 * 4. We redirect to /dashboard (role-based rendering happens there)
 * 5. On any failure, we show an inline error message — no page reload
 *
 * Design: mobile-first (full-screen centered layout), then scales to desktop.
 */

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { InputField } from "@/components/book-it/input-field"
import { Button } from "@/components/book-it/button"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  // Form state — controlled inputs keep React in sync with what the user typed
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")

  // Error message shown below the button when login fails
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Loading state disables the button and shows a spinner during the auth call
  const [isLoading, setIsLoading] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  /**
   * handleSubmit — called when the user clicks "Se connecter"
   *
   * We prevent the default form submit (which would reload the page),
   * call Supabase Auth, then either redirect or show an error.
   */
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Reset any previous error and start loading
    setErrorMessage(null)
    setIsLoading(true)

    try {
      // Step 1: authenticate with Supabase using email + password
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({ email, password })

      if (authError || !authData.user) {
        // Wrong email or password — show the French error message as specified
        setErrorMessage("Identifiants incorrects. Veuillez réessayer.")
        return
      }

      // Step 2: fetch the user's record from public.users to confirm they exist
      // and have a known role. RLS ensures they can only see their own row.
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("type")
        .eq("id", authData.user.id)
        .single()

      if (userError || !userData) {
        // Auth succeeded but no public.users row exists — sign out and show error
        // so the user isn't left in a half-authenticated state
        await supabase.auth.signOut()
        setErrorMessage("Identifiants incorrects. Veuillez réessayer.")
        return
      }

      // Step 3: verify the role is one we recognise (owner or provider)
      if (userData.type !== "owner" && userData.type !== "provider") {
        // Unknown role — sign out to avoid a broken session
        await supabase.auth.signOut()
        setErrorMessage("Identifiants incorrects. Veuillez réessayer.")
        return
      }

      // Step 4: everything checks out — navigate to the dashboard.
      // The dashboard server component will read the role and render accordingly.
      router.push("/dashboard")
    } finally {
      // Always stop loading, even if an error was thrown
      setIsLoading(false)
    }
  }

  return (
    // Full-screen centred layout — flex column so the form sits in the vertical middle
    <div className="flex flex-col justify-center min-h-screen px-6 bg-white">
      {/* Brand header — logo + app name */}
      <div className="mb-10 flex items-center gap-3">
        <Image
          src="/logo-transparent.png"
          alt="Book_it"
          width={40}
          height={40}
          className="rounded-sm"
          priority
        />
        <p className="text-xl font-semibold text-neutral-900">
          Book<span className="text-primary">_it</span>
        </p>
      </div>

      {/* Login form — flex column keeps inputs and button stacked vertically */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <InputField
          label="E-mail"
          type="email"
          placeholder="philippe@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={isLoading}
        />

        <InputField
          label="Mot de passe"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          disabled={isLoading}
        />

        <Button type="submit" className="w-full" isLoading={isLoading}>
          Se connecter
        </Button>

        {/* Inline error message — only shown when login fails, no page reload */}
        {errorMessage && (
          <p className="text-sm text-error text-center" role="alert">
            {errorMessage}
          </p>
        )}
      </form>
    </div>
  )
}
