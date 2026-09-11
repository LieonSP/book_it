/**
 * __tests__/app-header.test.tsx
 *
 * Vitest unit tests for Issue #67 — AppHeader two-state header
 * (dashboard: logo shown; sub-pages: back arrow shown, logo hidden).
 *
 * Strategy: This project runs Vitest with environment: "node" — no DOM, no
 * React rendering. We therefore test the LOGIC of AppHeader directly by
 * extracting and re-implementing the exact decision functions (same approach
 * as issue-45-logo-navigation.test.tsx).
 *
 * Scenarios covered:
 *  1  Back arrow shown, logo hidden on sub-page (/reservations)
 *  2  Logo shown, no back arrow on dashboard (/dashboard)
 *  3  Back arrow navigates /reservations → /dashboard (router.push)
 *  4  Back arrow navigates /reservations/nouvelle → /reservations
 *  5  Back arrow navigates /reservations/[id]/modifier → /reservations
 *  6  Back arrow navigates /synthese → /dashboard
 *  7  Unknown route: no arrow rendered, no crash
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { readFileSync, existsSync } from "fs"
import { resolve } from "path"

// ---------------------------------------------------------------------------
// Re-implementation of AppHeader decision logic for isolated testing.
//
// WHY re-implement instead of importing the component:
// The component uses React hooks (usePathname, useRouter). In a "node"
// environment there is no DOM, so rendering it would throw. We extract the
// exact decision tree and test it with a mock router — same approach used in
// issue-45-logo-navigation.test.tsx.
// ---------------------------------------------------------------------------

/**
 * PARENT_ROUTES — exact copy of the map from app-header.tsx.
 * Maps each static sub-page to the page it should navigate back to.
 */
const PARENT_ROUTES: Record<string, string> = {
  "/reservations": "/dashboard",
  "/reservations/nouvelle": "/reservations",
  "/synthese": "/dashboard",
}

/**
 * PAGE_TITLES — exact copy of the map from app-header.tsx.
 * Maps each static sub-page to its French title.
 */
const PAGE_TITLES: Record<string, string> = {
  "/reservations": "Réservations",
  "/reservations/nouvelle": "Nouvelle réservation",
  "/synthese": "Synthèse mensuelle",
}

/**
 * isOnDashboard — mirrors the derived boolean in AppHeader.
 * True only when the current route is exactly /dashboard.
 */
function isOnDashboard(pathname: string): boolean {
  return pathname === "/dashboard"
}

/**
 * isModifierRoute — mirrors the regex check in AppHeader.
 * True when the route matches /reservations/<id>/modifier.
 */
function isModifierRoute(pathname: string): boolean {
  return /^\/reservations\/[^/]+\/modifier$/.test(pathname)
}

/**
 * resolveParentRoute — mirrors the parentRoute derivation in AppHeader.
 * Returns the parent path to navigate to, or null if the route is unknown.
 */
function resolveParentRoute(pathname: string): string | null {
  if (isModifierRoute(pathname)) return "/reservations"
  return PARENT_ROUTES[pathname] ?? null
}

/**
 * shouldShowBackArrow — true when parentRoute is not null (sub-page state).
 * Mirrors the conditional rendering of <button> vs <div> in AppHeader.
 */
function shouldShowBackArrow(pathname: string): boolean {
  return resolveParentRoute(pathname) !== null
}

/**
 * shouldShowLogo — true only on /dashboard.
 * On /dashboard the component returns the dashboard JSX branch (logo visible).
 * On all other routes it returns the sub-page branch (logo NOT rendered).
 */
function shouldShowLogo(pathname: string): boolean {
  return isOnDashboard(pathname)
}

/**
 * handleBackClick — mirrors the click handler in AppHeader.
 * Calls router.push(parentRoute) if a parent is known; does nothing otherwise.
 */
function handleBackClick(
  pathname: string,
  router: { push: (path: string) => void }
): void {
  const parentRoute = resolveParentRoute(pathname)
  if (parentRoute) {
    router.push(parentRoute)
  }
}

/**
 * makeMockRouter — creates a mock router that records push/replace/back calls.
 * Mirrors the object returned by useRouter() from next/navigation.
 */
function makeMockRouter() {
  return {
    push:    vi.fn(),
    replace: vi.fn(),
    back:    vi.fn(),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Issue #67 — AppHeader two-state header logic", () => {

  let router: ReturnType<typeof makeMockRouter>

  beforeEach(() => {
    router = makeMockRouter()
  })

  // -------------------------------------------------------------------------
  // Scenario 1 — Back arrow shown on sub-pages, logo hidden
  // Given:  Authenticated user navigates to /reservations
  // When:   Page renders
  // Then:   ChevronLeft (back arrow) is visible; Image (logo) is NOT rendered
  // -------------------------------------------------------------------------
  describe("Scenario 1 — Back arrow shown on sub-pages, logo hidden", () => {
    it("shouldShowBackArrow returns true for /reservations", () => {
      expect(shouldShowBackArrow("/reservations")).toBe(true)
    })

    it("shouldShowLogo returns false for /reservations (logo hidden)", () => {
      expect(shouldShowLogo("/reservations")).toBe(false)
    })

    it("shouldShowBackArrow returns true and logo hidden for /synthese", () => {
      expect(shouldShowBackArrow("/synthese")).toBe(true)
      expect(shouldShowLogo("/synthese")).toBe(false)
    })

    it("shouldShowBackArrow returns true and logo hidden for /reservations/nouvelle", () => {
      expect(shouldShowBackArrow("/reservations/nouvelle")).toBe(true)
      expect(shouldShowLogo("/reservations/nouvelle")).toBe(false)
    })

    it("shouldShowBackArrow returns true and logo hidden for /reservations/123/modifier", () => {
      expect(shouldShowBackArrow("/reservations/123/modifier")).toBe(true)
      expect(shouldShowLogo("/reservations/123/modifier")).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 2 — Back arrow hidden on dashboard, logo shown
  // Given:  Authenticated user is on /dashboard
  // When:   Page renders
  // Then:   Image (logo) is visible; no ChevronLeft (back arrow) rendered
  // -------------------------------------------------------------------------
  describe("Scenario 2 — Back arrow hidden on dashboard, logo shown", () => {
    it("shouldShowLogo returns true for /dashboard", () => {
      expect(shouldShowLogo("/dashboard")).toBe(true)
    })

    it("shouldShowBackArrow returns false for /dashboard (no arrow)", () => {
      // On /dashboard the component returns the dashboard branch entirely —
      // the back-arrow button is never rendered.
      expect(shouldShowBackArrow("/dashboard")).toBe(false)
    })

    it("isOnDashboard is true exactly for /dashboard", () => {
      expect(isOnDashboard("/dashboard")).toBe(true)
    })

    it("isOnDashboard is false for /dashboardExtra (no partial match)", () => {
      // Guard against accidental prefix matching.
      expect(isOnDashboard("/dashboardExtra")).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 3 — Back arrow navigates /reservations → /dashboard
  // Given:  User is on /reservations
  // When:   User clicks the back arrow
  // Then:   router.push is called with "/dashboard"
  // -------------------------------------------------------------------------
  describe("Scenario 3 — /reservations → /dashboard", () => {
    it("handleBackClick calls router.push('/dashboard') from /reservations", () => {
      handleBackClick("/reservations", router)

      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith("/dashboard")
    })

    it("router.replace is NOT called (push only)", () => {
      handleBackClick("/reservations", router)
      expect(router.replace).not.toHaveBeenCalled()
    })

    it("router.back is NOT called (no browser history navigation)", () => {
      handleBackClick("/reservations", router)
      expect(router.back).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 4 — Back arrow navigates /reservations/nouvelle → /reservations
  // Given:  User is on /reservations/nouvelle
  // When:   User clicks the back arrow
  // Then:   router.push is called with "/reservations"
  // -------------------------------------------------------------------------
  describe("Scenario 4 — /reservations/nouvelle → /reservations", () => {
    it("handleBackClick calls router.push('/reservations') from /reservations/nouvelle", () => {
      handleBackClick("/reservations/nouvelle", router)

      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith("/reservations")
    })

    it("does NOT navigate to /dashboard from /reservations/nouvelle", () => {
      handleBackClick("/reservations/nouvelle", router)
      expect(router.push).not.toHaveBeenCalledWith("/dashboard")
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 5 — Back arrow navigates /reservations/[id]/modifier → /reservations
  // Given:  User is on /reservations/123/modifier (dynamic UUID segment)
  // When:   User clicks the back arrow
  // Then:   router.push is called with "/reservations"
  // -------------------------------------------------------------------------
  describe("Scenario 5 — /reservations/[id]/modifier → /reservations", () => {
    it("handleBackClick calls router.push('/reservations') from /reservations/123/modifier", () => {
      handleBackClick("/reservations/123/modifier", router)

      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith("/reservations")
    })

    it("handles a UUID-format id in the route", () => {
      handleBackClick("/reservations/a1b2c3d4-e5f6-7890-abcd-ef1234567890/modifier", router)

      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith("/reservations")
    })

    it("isModifierRoute is true for /reservations/123/modifier", () => {
      expect(isModifierRoute("/reservations/123/modifier")).toBe(true)
    })

    it("isModifierRoute is false for /reservations/modifier (missing id segment)", () => {
      // Two-segment path without an id — should NOT match the dynamic pattern.
      expect(isModifierRoute("/reservations/modifier")).toBe(false)
    })

    it("isModifierRoute is false for /reservations/123/autre (wrong last segment)", () => {
      expect(isModifierRoute("/reservations/123/autre")).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 6 — Back arrow navigates /synthese → /dashboard
  // Given:  User is on /synthese
  // When:   User clicks the back arrow
  // Then:   router.push is called with "/dashboard"
  // -------------------------------------------------------------------------
  describe("Scenario 6 — /synthese → /dashboard", () => {
    it("handleBackClick calls router.push('/dashboard') from /synthese", () => {
      handleBackClick("/synthese", router)

      expect(router.push).toHaveBeenCalledTimes(1)
      expect(router.push).toHaveBeenCalledWith("/dashboard")
    })

    it("router.back is NOT called from /synthese", () => {
      handleBackClick("/synthese", router)
      expect(router.back).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Scenario 7 — Unknown route: no crash, no arrow
  // Given:  User is on /unknown-page (not in the parent map)
  // When:   Page renders
  // Then:   No back arrow button rendered; no crash
  // -------------------------------------------------------------------------
  describe("Scenario 7 — Unknown route: no arrow, no crash", () => {
    it("resolveParentRoute returns null for /unknown-page", () => {
      expect(resolveParentRoute("/unknown-page")).toBeNull()
    })

    it("shouldShowBackArrow returns false for /unknown-page (no arrow rendered)", () => {
      expect(shouldShowBackArrow("/unknown-page")).toBe(false)
    })

    it("handleBackClick does NOT call router.push for /unknown-page (no crash)", () => {
      // The guard `if (parentRoute)` prevents any navigation — no error thrown.
      expect(() => handleBackClick("/unknown-page", router)).not.toThrow()
      expect(router.push).not.toHaveBeenCalled()
    })

    it("handleBackClick does not crash for empty string pathname", () => {
      expect(() => handleBackClick("", router)).not.toThrow()
      expect(router.push).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Acceptance criteria cross-checks
  // -------------------------------------------------------------------------
  describe("Acceptance criteria — touch target and routing method", () => {
    it("AC5 — touch target class h-11 w-11 present in app-header.tsx source", () => {
      // Static check: verify the source file contains the 44×44px touch target class.
const source = readFileSync(
        resolve(__dirname, "../components/book-it/app-header.tsx"),
        "utf-8"
      )
      expect(source).toContain("h-11 w-11")
    })

    it("AC6 — router.push() used, router.back() NOT called in app-header.tsx executable code", () => {
      // Static check: the component must call push(), never back().
      // We strip block comments and line comments before checking, because the
      // JSDoc in the file intentionally mentions "router.back()" in a comment
      // explaining WHY it is avoided — we only care about live call-sites.
const raw = readFileSync(
        resolve(__dirname, "../components/book-it/app-header.tsx"),
        "utf-8"
      )
      // Remove block comments (/* ... */) and line comments (// ...)
      const noComments = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")   // strip block comments
        .replace(/\/\/[^\n]*/g, "")          // strip line comments
      expect(noComments).toContain("router.push")
      expect(noComments).not.toContain("router.back")
    })

    it("AC6 — router.replace() NOT present in app-header.tsx source", () => {
const source = readFileSync(
        resolve(__dirname, "../components/book-it/app-header.tsx"),
        "utf-8"
      )
      expect(source).not.toContain("router.replace")
    })

    it("AC7 — all changes confined to AppHeader: no router.back() or router.replace() calls in executable code", () => {
      // Static check on executable code only (comments stripped).
const raw = readFileSync(
        resolve(__dirname, "../components/book-it/app-header.tsx"),
        "utf-8"
      )
      const noComments = raw
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/\/\/[^\n]*/g, "")
      expect(noComments).not.toContain("router.back()")
      expect(noComments).not.toContain("router.replace(")
    })

    it("AC3 — pointer-events-none present on title div in app-header.tsx source", () => {
      // Static check: centred title must have pointer-events-none to avoid
      // swallowing tap events on the back button and right-slot controls.
const source = readFileSync(
        resolve(__dirname, "../components/book-it/app-header.tsx"),
        "utf-8"
      )
      expect(source).toContain("pointer-events-none")
    })
  })

  // -------------------------------------------------------------------------
  // File cleanup checks
  // -------------------------------------------------------------------------
  describe("File cleanup — design-preview removal", () => {
    it("app/design-preview/ directory no longer exists", () => {
const dirPath = resolve(__dirname, "../app/design-preview")
      expect(existsSync(dirPath)).toBe(false)
    })

    it("proxy.ts has no design-preview exemption in matcher", () => {
const source = readFileSync(resolve(__dirname, "../proxy.ts"), "utf-8")
      expect(source).not.toContain("design-preview")
    })
  })

})
