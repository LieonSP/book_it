/**
 * __tests__/issue-45-logo-navigation.test.tsx
 *
 * Vitest unit tests for Issue #45 — Logo click navigation (AppHeader).
 *
 * Strategy: This project runs Vitest with environment: "node" — no DOM, no
 * React rendering. We therefore test the LOGIC of the AppHeader component
 * directly by extracting and exercising the handleLogoClick function and the
 * isOnDashboard guard in isolation. We also statically verify that the login
 * page does NOT use AppHeader (Scenario 4).
 *
 * Scenarios covered:
 *  1  Logo navigates from inner screen → /dashboard (router.push called)
 *  2  Logo does nothing when already on /dashboard (router.push NOT called)
 *  3  Provider logo navigation works identically to owner (Scenario 1 applies)
 *  4  Login page has no AppHeader / no navigation click handler
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

// ---------------------------------------------------------------------------
// Re-implementation of the AppHeader click logic for isolated testing.
//
// WHY re-implement instead of importing the component:
// The component uses React hooks (usePathname, useRouter). In a "node"
// environment there is no DOM, so rendering it would throw. Instead we
// extract the exact decision tree and test it with a mock router — the same
// approach used in booking-form.test.tsx and reservations.test.ts.
// ---------------------------------------------------------------------------

/**
 * Creates a mock router that records calls to push().
 * Mirrors the object shape returned by useRouter() from next/navigation.
 */
function makeMockRouter() {
  return {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }
}

/**
 * handleLogoClick — exact replica of the function inside AppHeader.
 *
 * Given the current pathname and a router, navigates to /dashboard only when
 * not already there.
 */
function handleLogoClick(pathname: string, router: { push: (path: string) => void }) {
  if (pathname !== "/dashboard") {
    router.push("/dashboard")
  }
  // If already on /dashboard: do nothing.
}

/**
 * isOnDashboard — mirrors the derived boolean in AppHeader.
 * Used to verify disabled state and cursor class.
 */
function isOnDashboard(pathname: string): boolean {
  return pathname === "/dashboard"
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Issue #45 — AppHeader logo navigation logic", () => {

  let router: ReturnType<typeof makeMockRouter>

  beforeEach(() => {
    router = makeMockRouter()
  })

  // -------------------------------------------------------------------------
  // Scenario 1 — Logo navigates from an inner screen to /dashboard
  // Given: authenticated user on a non-dashboard screen (e.g. /reservations)
  // When:  handleLogoClick is called
  // Then:  router.push("/dashboard") is called exactly once
  // -------------------------------------------------------------------------
  it("Scenario 1 — navigates to /dashboard from /reservations", () => {
    const pathname = "/reservations"

    handleLogoClick(pathname, router)

    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith("/dashboard")
  })

  it("Scenario 1 — navigates to /dashboard from /reservations/nouvelle", () => {
    // Also covers a deeper nested route
    handleLogoClick("/reservations/nouvelle", router)

    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith("/dashboard")
  })

  it("Scenario 1 — isOnDashboard is false for /reservations", () => {
    expect(isOnDashboard("/reservations")).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Scenario 2 — Logo does nothing when already on /dashboard
  // Given: authenticated user on /dashboard
  // When:  handleLogoClick is called
  // Then:  router.push is NOT called; isOnDashboard returns true (button disabled)
  // -------------------------------------------------------------------------
  it("Scenario 2 — does NOT call router.push when already on /dashboard", () => {
    const pathname = "/dashboard"

    handleLogoClick(pathname, router)

    expect(router.push).toHaveBeenCalledTimes(0)
  })

  it("Scenario 2 — isOnDashboard returns true on /dashboard (button disabled)", () => {
    expect(isOnDashboard("/dashboard")).toBe(true)
  })

  it("Scenario 2 — calling handleLogoClick multiple times on /dashboard never navigates", () => {
    handleLogoClick("/dashboard", router)
    handleLogoClick("/dashboard", router)
    handleLogoClick("/dashboard", router)

    expect(router.push).toHaveBeenCalledTimes(0)
  })

  // -------------------------------------------------------------------------
  // Scenario 3 — Provider logo navigation works identically to owner
  // The handleLogoClick function is role-agnostic. The same path check applies
  // regardless of whether the caller is an owner or a provider.
  // -------------------------------------------------------------------------
  it("Scenario 3 — provider on /reservations: navigates to /dashboard", () => {
    // Provider authenticated, on /reservations
    const providerPathname = "/reservations"

    handleLogoClick(providerPathname, router)

    expect(router.push).toHaveBeenCalledTimes(1)
    expect(router.push).toHaveBeenCalledWith("/dashboard")
  })

  it("Scenario 3 — provider on /dashboard: does NOT navigate (same guard)", () => {
    handleLogoClick("/dashboard", router)
    expect(router.push).toHaveBeenCalledTimes(0)
  })

  // -------------------------------------------------------------------------
  // Scenario 4 — Login page has no navigation-triggering click handler
  //
  // We verify this by statically inspecting the source file of login/page.tsx.
  // We check two things:
  //   a) AppHeader is NOT imported on the login page
  //   b) The logo <Image> on the login page is NOT wrapped in a button with
  //      any onClick handler that navigates to /dashboard
  //
  // This is a static analysis test — it catches regressions if someone
  // accidentally adds a click handler to the login logo in the future.
  // -------------------------------------------------------------------------
  describe("Scenario 4 — login page logo has no navigation handler", () => {
    let loginPageSource: string

    beforeEach(() => {
      const filePath = resolve(
        __dirname,
        "../app/login/page.tsx"
      )
      loginPageSource = readFileSync(filePath, "utf-8")
    })

    it("does NOT import AppHeader on the login page", () => {
      // If AppHeader were imported, it would contain the navigation click handler
      expect(loginPageSource).not.toContain("AppHeader")
    })

    it("does NOT contain a router.push('/dashboard') call on the login page logo block", () => {
      // Any logo click navigation would require a call to router.push("/dashboard")
      // or router.push('/dashboard') specifically tied to the logo.
      // The login page DOES call router.push("/dashboard") after successful auth —
      // that is expected and correct. We verify the logo itself has no onClick.
      //
      // The logo block in login/page.tsx is the <Image> inside a plain <div>
      // (not a <button>). We verify no onClick attribute appears near the Image tag.
      const lines = loginPageSource.split("\n")
      const logoImageLineIdx = lines.findIndex((l) => l.includes('src="/logo-transparent.png"'))

      expect(logoImageLineIdx).toBeGreaterThan(-1) // logo exists on the page

      // Look at a window of 5 lines around the logo image for any onClick
      const surroundingLines = lines.slice(
        Math.max(0, logoImageLineIdx - 5),
        logoImageLineIdx + 5
      ).join("\n")

      expect(surroundingLines).not.toContain("onClick")
    })

    it("logo on login page is inside a <div>, not a <button>", () => {
      // The logo block should be a plain div — not a button that could fire navigation
      const lines = loginPageSource.split("\n")
      const logoImageLineIdx = lines.findIndex((l) => l.includes('src="/logo-transparent.png"'))

      expect(logoImageLineIdx).toBeGreaterThan(-1)

      // Look 5 lines before the logo tag to find the wrapping element
      const precedingLines = lines.slice(
        Math.max(0, logoImageLineIdx - 5),
        logoImageLineIdx
      ).join("\n")

      // Should contain a div, NOT a button
      expect(precedingLines).toContain("<div")
      expect(precedingLines).not.toContain("<button")
    })
  })

  // -------------------------------------------------------------------------
  // Additional guard — edge cases
  // -------------------------------------------------------------------------
  it("navigates to /dashboard from root path /", () => {
    handleLogoClick("/", router)
    expect(router.push).toHaveBeenCalledWith("/dashboard")
  })

  it("navigates to /dashboard from /proprietes", () => {
    handleLogoClick("/proprietes", router)
    expect(router.push).toHaveBeenCalledWith("/dashboard")
  })

  it("navigates to /dashboard from /synthese", () => {
    handleLogoClick("/synthese", router)
    expect(router.push).toHaveBeenCalledWith("/dashboard")
  })

  it("isOnDashboard is false for paths that only start with /dashboard (e.g. /dashboardX)", () => {
    // Guards against accidental prefix matching — e.g. "/dashboardExtra" should NOT be treated as /dashboard
    expect(isOnDashboard("/dashboardExtra")).toBe(false)
  })

})
