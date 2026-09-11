/**
 * __tests__/issue-50-dashboard-tiles.test.ts
 *
 * Vitest unit tests for Issue #50 — Hide Propriétés and Prestataires tiles.
 *
 * Strategy: Vitest runs in "node" environment — no DOM, no React rendering.
 * We test the OWNER_CARDS and PROVIDER_CARDS data arrays by statically reading
 * and parsing app/dashboard/page.tsx. The tile definitions are static const
 * arrays — we extract them line-by-line and test their contents.
 *
 * WHY line-by-line instead of regex on the full file:
 * The TypeScript generic syntax `NavCard[]` contains `]` which would
 * cause a lazy `[\s\S]*?\]` regex to stop at the type annotation bracket,
 * not at the end of the array literal. Line-by-line parsing is more robust.
 *
 * Scenarios covered:
 *  1  Owner dashboard shows only active tiles (Réservations + Synthèse)
 *  2  Synthèse appears immediately after Réservations — no active items between
 *  3  Provider dashboard is unaffected (only Réservations tile)
 */

import { describe, it, expect, beforeAll } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"

// ---------------------------------------------------------------------------
// Helpers: extract card-array blocks from source
// ---------------------------------------------------------------------------

/**
 * Given all source lines, find the lines belonging to a `const <name>` array.
 * Returns the lines from the `const <name>...` line up to and including the
 * closing `]` line.
 */
function extractArrayBlock(lines: string[], constName: string): string[] {
  const startIdx = lines.findIndex((l) => l.includes(`const ${constName}`))
  if (startIdx === -1) return []

  // The closing bracket is a line whose trim() is exactly "]"
  let endIdx = -1
  for (let i = startIdx; i < lines.length; i++) {
    if (lines[i].trim() === "]") {
      endIdx = i
      break
    }
  }
  if (endIdx === -1) return []
  return lines.slice(startIdx, endIdx + 1)
}

/**
 * From a block of lines (a card array), return the label strings for
 * entries that are NOT commented out (active tiles).
 */
function activeLabels(block: string[]): string[] {
  return block
    .filter((l) => !l.trim().startsWith("//"))
    .flatMap((l) => {
      const m = l.match(/label:\s*"([^"]+)"/)
      return m ? [m[1]] : []
    })
}

/**
 * From a block of lines (a card array), return the label strings for
 * entries that ARE commented out.
 */
function commentedLabels(block: string[]): string[] {
  return block
    .filter((l) => l.trim().startsWith("//"))
    .flatMap((l) => {
      const m = l.match(/label:\s*"([^"]+)"/)
      return m ? [m[1]] : []
    })
}

// ---------------------------------------------------------------------------
// Load source once
// ---------------------------------------------------------------------------

let lines: string[]
let ownerBlock: string[]
let providerBlock: string[]

beforeAll(() => {
  const filePath = resolve(__dirname, "../app/dashboard/page.tsx")
  const src = readFileSync(filePath, "utf-8")
  lines = src.split("\n")
  ownerBlock = extractArrayBlock(lines, "OWNER_CARDS")
  providerBlock = extractArrayBlock(lines, "PROVIDER_CARDS")
})

// ---------------------------------------------------------------------------
// Scenario 1 — Owner dashboard shows only active tiles
// ---------------------------------------------------------------------------

describe("Scenario 1 — Owner dashboard active tiles", () => {

  it("OWNER_CARDS block is found in source", () => {
    expect(ownerBlock.length).toBeGreaterThan(0)
  })

  it("OWNER_CARDS contains Réservations as an active tile", () => {
    expect(activeLabels(ownerBlock)).toContain("Réservations")
  })

  it("OWNER_CARDS contains Synthèse as an active tile", () => {
    expect(activeLabels(ownerBlock)).toContain("Synthèse")
  })

  it("OWNER_CARDS does NOT contain Propriétés as an active tile", () => {
    expect(activeLabels(ownerBlock)).not.toContain("Propriétés")
  })

  it("OWNER_CARDS does NOT contain Prestataires as an active tile", () => {
    expect(activeLabels(ownerBlock)).not.toContain("Prestataires")
  })

  it("OWNER_CARDS has exactly 3 active tiles (Réservations, Synthèse, Extraction)", () => {
    // Was 2 until issue #74 added the Extraction tile — updated so this test
    // reflects the current source instead of failing on an intentional addition.
    expect(activeLabels(ownerBlock)).toHaveLength(3)
  })

})

// ---------------------------------------------------------------------------
// Scenario 2 — Correct tile order: Synthèse immediately after Réservations
// ---------------------------------------------------------------------------

describe("Scenario 2 — Tile order: Synthèse immediately follows Réservations", () => {

  it("Réservations is the first active tile", () => {
    const labels = activeLabels(ownerBlock)
    expect(labels[0]).toBe("Réservations")
  })

  it("Synthèse is the second active tile (immediately after Réservations)", () => {
    const labels = activeLabels(ownerBlock)
    expect(labels[1]).toBe("Synthèse")
  })

  it("No active tile appears between Réservations and Synthèse in source order", () => {
    // Find line index (within the block) for active Réservations and Synthèse
    const reservationsLineIdx = ownerBlock.findIndex(
      (l) => !l.trim().startsWith("//") && l.includes('"Réservations"')
    )
    const syntheseLineIdx = ownerBlock.findIndex(
      (l) => !l.trim().startsWith("//") && l.includes('"Synthèse"')
    )

    expect(reservationsLineIdx).toBeGreaterThan(-1)
    expect(syntheseLineIdx).toBeGreaterThan(-1)

    // All lines strictly between them must be blank or commented out
    const linesBetween = ownerBlock.slice(reservationsLineIdx + 1, syntheseLineIdx)
    for (const line of linesBetween) {
      const trimmed = line.trim()
      const isBlankOrComment =
        trimmed === "" || trimmed.startsWith("//")
      expect(
        isBlankOrComment,
        `Unexpected active line between Réservations and Synthèse: "${line}"`
      ).toBe(true)
    }
  })

  it("Propriétés is still present in source as a comment (not deleted)", () => {
    expect(commentedLabels(ownerBlock)).toContain("Propriétés")
  })

  it("Prestataires is still present in source as a comment (not deleted)", () => {
    expect(commentedLabels(ownerBlock)).toContain("Prestataires")
  })

  it("Commented-out icons Building2 and Users remain in the import line", () => {
    // The import line must reference them inside /* */ so re-enabling is one uncomment
    const importLine = lines.find(
      (l) => l.includes("CalendarDays") && l.includes("BarChart2")
    )
    expect(importLine).toBeDefined()
    expect(importLine).toContain("Building2")
    expect(importLine).toContain("Users")
    expect(importLine).toContain("/*")
  })

})

// ---------------------------------------------------------------------------
// Scenario 3 — Provider dashboard is unaffected
// ---------------------------------------------------------------------------

describe("Scenario 3 — Provider dashboard unaffected", () => {

  it("PROVIDER_CARDS block is found in source", () => {
    expect(providerBlock.length).toBeGreaterThan(0)
  })

  it("PROVIDER_CARDS contains Réservations", () => {
    expect(activeLabels(providerBlock)).toContain("Réservations")
  })

  it("PROVIDER_CARDS has exactly 1 tile (unchanged)", () => {
    expect(activeLabels(providerBlock)).toHaveLength(1)
  })

  it("PROVIDER_CARDS does NOT contain Propriétés", () => {
    expect(activeLabels(providerBlock)).not.toContain("Propriétés")
  })

  it("PROVIDER_CARDS does NOT contain Prestataires", () => {
    expect(activeLabels(providerBlock)).not.toContain("Prestataires")
  })

  it("PROVIDER_CARDS does NOT contain Synthèse", () => {
    expect(activeLabels(providerBlock)).not.toContain("Synthèse")
  })

})
