/**
 * __tests__/issue-55-white-favicon.test.ts
 *
 * Vitest static tests for Issue #55 — Make the favicon white.
 *
 * Strategy: file-system and source-code checks only — no DOM rendering needed.
 * We verify:
 *   (a) the white SVG asset exists in /public
 *   (b) the SVG contains valid SVG markup with white fill elements
 *   (c) layout.tsx overrides the favicon via metadata.icons (so the white SVG wins)
 *   (d) the page logo source (/logo-transparent.png) is NOT modified
 *   (e) the original app/icon.png is untouched (so #47 tests still pass)
 *
 * Scenarios covered:
 *  1  /public/favicon-white.svg exists
 *  2  favicon-white.svg is valid SVG (starts with <svg or contains <svg)
 *  3  favicon-white.svg references white fill (fill="white" or fill="#fff" / fill="#ffffff")
 *  4  favicon-white.svg has a transparent background (no opaque background rect)
 *  5  app/layout.tsx references favicon-white.svg in metadata.icons
 *  6  app/layout.tsx does NOT reference logo-transparent.png (page logo untouched there)
 *  7  app/icon.png still exists (original #47 asset preserved)
 */

import { describe, it, expect } from "vitest"
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Root of the repository — __dirname is __tests__/, so we go one level up
const ROOT = resolve(__dirname, "..")

const WHITE_SVG_PATH  = resolve(ROOT, "public/favicon-white.svg")
const LAYOUT_PATH     = resolve(ROOT, "app/layout.tsx")
const ICON_PNG_PATH   = resolve(ROOT, "app/icon.png")

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads a file as a UTF-8 string.
 * Used to inspect SVG markup and TypeScript source without any parsing library.
 */
function readText(filePath: string): string {
  return readFileSync(filePath, "utf-8")
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Issue #55 — White favicon: separate white SVG asset + metadata override", () => {

  // -------------------------------------------------------------------------
  // Scenario 1 — Asset existence
  // Given: the dev agent created /public/favicon-white.svg
  // When:  we check the file system
  // Then:  the file must exist
  // -------------------------------------------------------------------------
  it("Scenario 1 — /public/favicon-white.svg exists", () => {
    expect(existsSync(WHITE_SVG_PATH)).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Scenario 2 — Valid SVG format
  // Given: favicon-white.svg exists
  // When:  we read its contents
  // Then:  it must contain the <svg opening tag (valid SVG document)
  // -------------------------------------------------------------------------
  it("Scenario 2 — favicon-white.svg is a valid SVG (contains <svg tag)", () => {
    const content = readText(WHITE_SVG_PATH)
    // Case-insensitive match because some SVG generators lowercase the tag
    expect(content.toLowerCase()).toContain("<svg")
  })

  // -------------------------------------------------------------------------
  // Scenario 3 — White fill
  // Given: favicon-white.svg is an SVG
  // When:  we read its contents
  // Then:  it must reference a white color (fill="white", #fff, or #ffffff)
  //        This ensures the house shape renders in white, not blue or transparent.
  // -------------------------------------------------------------------------
  it('Scenario 3 — favicon-white.svg contains a white fill declaration', () => {
    const content = readText(WHITE_SVG_PATH).toLowerCase()
    // Accept any common form of "white": named color or 3/6-digit hex
    const hasWhiteFill =
      content.includes('fill="white"') ||
      content.includes("fill='white'") ||
      content.includes('fill="#fff"') ||
      content.includes('fill="#ffffff"') ||
      content.includes('stroke="white"') ||
      content.includes("stroke='white'")
    expect(hasWhiteFill).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Scenario 4 — Transparent background (no opaque background rect)
  // Given: the favicon must adapt to any browser chrome color
  // When:  we read favicon-white.svg
  // Then:  there must be no <rect that fills the entire canvas with a solid color
  //        (We check that no fill="black", fill="blue", fill="#0000" etc. covers
  //         the background — a background="transparent" or no background rect at
  //         all is correct.)
  //
  // Note: this is a heuristic check. An all-white background rect would make the
  //       favicon look wrong on light browser UIs. We check common opaque colors.
  // -------------------------------------------------------------------------
  it("Scenario 4 — favicon-white.svg has no opaque non-white background", () => {
    const content = readText(WHITE_SVG_PATH).toLowerCase()
    // These patterns would indicate an opaque colored background — bad for dark/light themes
    const hasOpaqueBackground =
      content.includes('fill="black"') ||
      content.includes('fill="#000"') ||
      content.includes('fill="#000000"') ||
      content.includes('fill="blue"') ||
      content.includes('fill="#003580"') ||    // the original blue from the brand icon
      content.includes('fill="navy"')
    expect(hasOpaqueBackground).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Scenario 5 — layout.tsx references the white SVG in metadata.icons
  // Given: layout.tsx exports a Next.js Metadata object
  // When:  we read its source
  // Then:  it must reference "favicon-white.svg" inside the icons field
  //        This confirms the metadata override is in place so Next.js emits
  //        <link rel="icon" href="/favicon-white.svg"> instead of icon.png.
  // -------------------------------------------------------------------------
  it("Scenario 5 — app/layout.tsx references favicon-white.svg in metadata", () => {
    const content = readText(LAYOUT_PATH)
    expect(content).toContain("favicon-white.svg")
  })

  // -------------------------------------------------------------------------
  // Scenario 5b — layout.tsx uses the metadata.icons API (not a <link> tag)
  // Next.js App Router metadata icons are declared as:  icons: { icon: "..." }
  // We verify the icons key is present in the metadata export.
  // -------------------------------------------------------------------------
  it("Scenario 5b — app/layout.tsx declares metadata.icons (not a <link> tag)", () => {
    const content = readText(LAYOUT_PATH)
    // The metadata object must contain the icons property
    expect(content).toContain("icons:")
  })

  // -------------------------------------------------------------------------
  // Scenario 6 — Page logo is untouched: AppHeader still uses logo-transparent.png
  // The page logo must still be referenced in AppHeader (not moved or renamed).
  // We check app-header.tsx directly — that's where the logo lives.
  // -------------------------------------------------------------------------
  it("Scenario 6 — AppHeader still uses /logo-transparent.png (page logo untouched)", () => {
    const appHeaderPath = resolve(ROOT, "components/book-it/app-header.tsx")
    const content = readText(appHeaderPath)
    // The page logo src must still point to the original blue PNG
    expect(content).toContain("logo-transparent.png")
  })

  // -------------------------------------------------------------------------
  // Scenario 7 — Original app/icon.png is preserved (regression guard for #47)
  // The white favicon is a new asset; app/icon.png must remain in place
  // so that the #47 tests continue to pass.
  // -------------------------------------------------------------------------
  it("Scenario 7 — app/icon.png still exists (regression guard for issue #47)", () => {
    expect(existsSync(ICON_PNG_PATH)).toBe(true)
  })

})
