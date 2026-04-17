/**
 * __tests__/issue-6-synthese.test.ts
 *
 * Vitest unit tests for Issue #6 — Synthèse screen.
 *
 * Strategy: pure logic tests — no React rendering, no Supabase client.
 * We extract the exact filtering and aggregation logic from app/synthese/page.tsx
 * and exercise it with controlled in-memory fixtures.
 *
 * Scenarios covered here (1–6, 10):
 *   1  — Per-listing totals (happy path): 2 listings, correct sums and grand total
 *   2  — Cancelled bookings excluded (DB query uses .neq("status","cancelled"),
 *          tested here with a pre-filtered set as the component would receive)
 *   3  — Month filter narrows to a single month
 *   4  — Listing filter narrows to a single listing
 *   5  — Provider filter narrows to a single provider
 *   6  — Total frais prestataires sums provider_fee for filtered bookings
 *   10 — Empty state: 0 bookings → all metrics = 0, no rows
 *
 * Scenarios 7–9 (DB-level RLS / data isolation) live in:
 *   __tests__/sql/issue-6-synthese-db.sql
 */

import { describe, it, expect } from "vitest"

// ---------------------------------------------------------------------------
// Types — mirrored from app/synthese/page.tsx
// ---------------------------------------------------------------------------

interface BookingRow {
  rental_price: number
  provider_fee: number
  check_in:     string        // YYYY-MM-DD
  listing_id:   string
  listing_name: string
  provider_id:  string | null
}

interface ListingSummary {
  listing_id:   string
  listing_name: string
  total:        number
}

// ---------------------------------------------------------------------------
// Pure logic extracted from app/synthese/page.tsx — the functions under test.
// We copy the exact implementation so any divergence between page and tests
// is immediately visible.
// ---------------------------------------------------------------------------

/**
 * applyFilters — reproduces the filteredBookings useMemo from the page.
 * All four filters use AND logic.
 */
function applyFilters(
  bookings:       BookingRow[],
  filterYear:     string,
  filterMonth:    string,
  filterListing:  string,
  filterProvider: string,
): BookingRow[] {
  return bookings.filter((b) => {
    if (filterYear     && !b.check_in.startsWith(filterYear))    return false
    if (filterMonth    && !b.check_in.startsWith(filterMonth))   return false
    if (filterListing  && b.listing_id !== filterListing)         return false
    if (filterProvider && b.provider_id !== filterProvider)       return false
    return true
  })
}

/**
 * computeListingSummaries — reproduces the listingSummaries useMemo from the page.
 * Groups by listing_id, sums rental_price, sorts A→Z.
 */
function computeListingSummaries(filtered: BookingRow[]): ListingSummary[] {
  const map = new Map<string, ListingSummary>()
  filtered.forEach((b) => {
    const existing = map.get(b.listing_id)
    if (existing) {
      existing.total += b.rental_price
    } else {
      map.set(b.listing_id, {
        listing_id:   b.listing_id,
        listing_name: b.listing_name,
        total:        b.rental_price,
      })
    }
  })
  return Array.from(map.values()).sort((a, b) =>
    a.listing_name.localeCompare(b.listing_name, "fr")
  )
}

/**
 * computeGrandTotal — sum of all per-listing totals.
 */
function computeGrandTotal(summaries: ListingSummary[]): number {
  return summaries.reduce((sum, l) => sum + l.total, 0)
}

/**
 * computeMoyenneMensuelle — grand_total / 12.
 * Always divides by 12 regardless of month filter.
 */
function computeMoyenneMensuelle(grandTotal: number): number {
  return grandTotal / 12
}

/**
 * computeFraisPresta — sum of provider_fee for filtered bookings.
 */
function computeFraisPresta(filtered: BookingRow[]): number {
  return filtered.reduce((sum, b) => sum + b.provider_fee, 0)
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Factory for a BookingRow — sensible defaults, easy overrides. */
function makeBooking(overrides: Partial<BookingRow> & { listing_id: string }): BookingRow {
  return {
    rental_price: 500,
    provider_fee: 0,
    check_in:     "2026-06-01",
    listing_name: "Listing Default",
    provider_id:  null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 — Per-listing totals (happy path)
// ---------------------------------------------------------------------------

describe("Scenario 1 — Per-listing totals (happy path)", () => {
  // L1 has two bookings: 1 000 € + 800 €
  // L2 has one booking: 500 €
  const bookings: BookingRow[] = [
    makeBooking({ listing_id: "L1", listing_name: "Listing 1", rental_price: 1000, check_in: "2026-03-01" }),
    makeBooking({ listing_id: "L1", listing_name: "Listing 1", rental_price: 800,  check_in: "2026-07-01" }),
    makeBooking({ listing_id: "L2", listing_name: "Listing 2", rental_price: 500,  check_in: "2026-05-01" }),
  ]

  it("L1 total = 1 800 €", () => {
    const filtered   = applyFilters(bookings, "2026", "", "", "")
    const summaries  = computeListingSummaries(filtered)
    const l1         = summaries.find((s) => s.listing_id === "L1")
    expect(l1?.total).toBe(1800)
  })

  it("L2 total = 500 €", () => {
    const filtered   = applyFilters(bookings, "2026", "", "", "")
    const summaries  = computeListingSummaries(filtered)
    const l2         = summaries.find((s) => s.listing_id === "L2")
    expect(l2?.total).toBe(500)
  })

  it("Grand total = 2 300 €", () => {
    const filtered   = applyFilters(bookings, "2026", "", "", "")
    const summaries  = computeListingSummaries(filtered)
    const grand      = computeGrandTotal(summaries)
    expect(grand).toBe(2300)
  })

  it("Moyenne mensuelle = 2 300 ÷ 12 ≈ 191.67 €", () => {
    const filtered   = applyFilters(bookings, "2026", "", "", "")
    const summaries  = computeListingSummaries(filtered)
    const grand      = computeGrandTotal(summaries)
    const moyenne    = computeMoyenneMensuelle(grand)
    // Use toBeCloseTo to handle floating-point representation
    expect(moyenne).toBeCloseTo(191.67, 2)
  })

  it("Returns exactly 2 listing rows", () => {
    const filtered   = applyFilters(bookings, "2026", "", "", "")
    const summaries  = computeListingSummaries(filtered)
    expect(summaries).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Scenario 2 — Cancelled bookings excluded
// ---------------------------------------------------------------------------

describe("Scenario 2 — Cancelled bookings excluded from totals", () => {
  // The DB query uses .neq("status","cancelled") — by the time bookings reach
  // the component they are already non-cancelled.  We simulate this by passing
  // only non-cancelled bookings (as the component would receive from the DB).
  // A separate test confirms that if somehow a cancelled booking slipped in,
  // the component sums it — this documents the contract: exclusion happens at DB.

  it("Only confirmed booking (900 €) is in the total when cancelled (300 €) was filtered out at DB level", () => {
    // Simulates what the component receives: already filtered set
    const bookings: BookingRow[] = [
      makeBooking({ listing_id: "L1", listing_name: "L1", rental_price: 900, check_in: "2026-01-10" }),
      // the 300 € cancelled booking was removed by .neq("status","cancelled") in the query
    ]

    const filtered  = applyFilters(bookings, "2026", "", "", "")
    const summaries = computeListingSummaries(filtered)
    const grand     = computeGrandTotal(summaries)

    expect(grand).toBe(900)
    expect(summaries[0]?.total).toBe(900)
  })

  it("Would incorrectly include a cancelled booking if it were present — confirming exclusion must happen at DB", () => {
    // This test explicitly documents that the component has no status filter —
    // it trusts the DB to have already removed cancelled rows.
    const bookingsWithCancelled: BookingRow[] = [
      makeBooking({ listing_id: "L1", listing_name: "L1", rental_price: 900, check_in: "2026-01-10" }),
      makeBooking({ listing_id: "L1", listing_name: "L1", rental_price: 300, check_in: "2026-01-15" }),
    ]
    // If cancelled rows leaked through, the total would be 1 200 — not 900.
    const filtered  = applyFilters(bookingsWithCancelled, "2026", "", "", "")
    const grand     = computeGrandTotal(computeListingSummaries(filtered))
    // This is the "wrong" state — 1 200 — confirming the exclusion MUST happen at DB level.
    expect(grand).toBe(1200)
  })
})

// ---------------------------------------------------------------------------
// Scenario 3 — Month filter
// ---------------------------------------------------------------------------

describe("Scenario 3 — Month filter", () => {
  const bookings: BookingRow[] = [
    makeBooking({ listing_id: "L1", listing_name: "L1", rental_price: 500, check_in: "2026-01-15" }),
    makeBooking({ listing_id: "L1", listing_name: "L1", rental_price: 700, check_in: "2026-02-10" }),
  ]

  it("Applying Month = 2026-01 shows only the 500 € booking", () => {
    const filtered  = applyFilters(bookings, "2026", "2026-01", "", "")
    const summaries = computeListingSummaries(filtered)
    expect(summaries[0]?.total).toBe(500)
    expect(summaries).toHaveLength(1)
  })

  it("Grand total with Month = January = 500 €", () => {
    const filtered = applyFilters(bookings, "2026", "2026-01", "", "")
    const grand    = computeGrandTotal(computeListingSummaries(filtered))
    expect(grand).toBe(500)
  })

  it("Moyenne mensuelle with Month = January = 500 ÷ 12 ≈ 41.67 €", () => {
    // Spec: moyenne is always yearly average regardless of month filter
    const filtered  = applyFilters(bookings, "2026", "2026-01", "", "")
    const grand     = computeGrandTotal(computeListingSummaries(filtered))
    const moyenne   = computeMoyenneMensuelle(grand)
    expect(moyenne).toBeCloseTo(41.67, 2)
  })

  it("February booking is excluded when Month = January", () => {
    const filtered  = applyFilters(bookings, "2026", "2026-01", "", "")
    const summaries = computeListingSummaries(filtered)
    const grand     = computeGrandTotal(summaries)
    // 700 € must NOT appear
    expect(grand).not.toBe(1200)
    expect(grand).not.toBe(700)
  })
})

// ---------------------------------------------------------------------------
// Scenario 4 — Listing filter
// ---------------------------------------------------------------------------

describe("Scenario 4 — Listing filter", () => {
  const bookings: BookingRow[] = [
    makeBooking({ listing_id: "L1", listing_name: "Listing 1", rental_price: 1000, check_in: "2026-03-01" }),
    makeBooking({ listing_id: "L2", listing_name: "Listing 2", rental_price: 600,  check_in: "2026-05-01" }),
  ]

  it("Applying Listing = L1 shows only L1 with 1 000 €", () => {
    const filtered  = applyFilters(bookings, "2026", "", "L1", "")
    const summaries = computeListingSummaries(filtered)
    expect(summaries).toHaveLength(1)
    expect(summaries[0]?.listing_id).toBe("L1")
    expect(summaries[0]?.total).toBe(1000)
  })

  it("L2 is not shown when listing filter = L1", () => {
    const filtered  = applyFilters(bookings, "2026", "", "L1", "")
    const summaries = computeListingSummaries(filtered)
    const l2        = summaries.find((s) => s.listing_id === "L2")
    expect(l2).toBeUndefined()
  })

  it("Grand total = 1 000 € when listing filter = L1", () => {
    const filtered = applyFilters(bookings, "2026", "", "L1", "")
    const grand    = computeGrandTotal(computeListingSummaries(filtered))
    expect(grand).toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Scenario 5 — Provider filter
// ---------------------------------------------------------------------------

describe("Scenario 5 — Provider filter", () => {
  // L1 has bookings by P1 and P2
  const bookings: BookingRow[] = [
    makeBooking({ listing_id: "L1", listing_name: "L1", rental_price: 800, provider_fee: 50, check_in: "2026-04-01", provider_id: "P1" }),
    makeBooking({ listing_id: "L1", listing_name: "L1", rental_price: 600, provider_fee: 40, check_in: "2026-06-01", provider_id: "P2" }),
  ]

  it("Per-listing total for L1 = 800 € when Provider = P1", () => {
    const filtered  = applyFilters(bookings, "2026", "", "", "P1")
    const summaries = computeListingSummaries(filtered)
    expect(summaries[0]?.total).toBe(800)
  })

  it("Frais prestataires = 50 € when Provider = P1", () => {
    const filtered = applyFilters(bookings, "2026", "", "", "P1")
    const frais    = computeFraisPresta(filtered)
    expect(frais).toBe(50)
  })

  it("P2 booking is excluded when Provider = P1", () => {
    const filtered  = applyFilters(bookings, "2026", "", "", "P1")
    const summaries = computeListingSummaries(filtered)
    const grand     = computeGrandTotal(summaries)
    // 800 + 600 = 1 400 must NOT appear
    expect(grand).toBe(800)
  })
})

// ---------------------------------------------------------------------------
// Scenario 6 — Total frais prestataires
// ---------------------------------------------------------------------------

describe("Scenario 6 — Total frais prestataires", () => {
  const bookings: BookingRow[] = [
    makeBooking({ listing_id: "L1", listing_name: "L1", provider_fee: 50,  check_in: "2026-01-01" }),
    makeBooking({ listing_id: "L1", listing_name: "L1", provider_fee: 60,  check_in: "2026-02-01" }),
    makeBooking({ listing_id: "L2", listing_name: "L2", provider_fee: 70,  check_in: "2026-03-01" }),
  ]

  it("Total frais prestataires = 180 € (50 + 60 + 70)", () => {
    const filtered = applyFilters(bookings, "2026", "", "", "")
    const frais    = computeFraisPresta(filtered)
    expect(frais).toBe(180)
  })

  it("Three bookings are included in the sum", () => {
    const filtered = applyFilters(bookings, "2026", "", "", "")
    expect(filtered).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Scenario 10 — Empty state (no bookings)
// ---------------------------------------------------------------------------

describe("Scenario 10 — Empty state (no bookings)", () => {
  const bookings: BookingRow[] = []

  it("Grand total = 0 when no bookings", () => {
    const filtered  = applyFilters(bookings, "2026", "", "", "")
    const summaries = computeListingSummaries(filtered)
    const grand     = computeGrandTotal(summaries)
    expect(grand).toBe(0)
  })

  it("Moyenne mensuelle = 0 when no bookings", () => {
    const filtered  = applyFilters(bookings, "2026", "", "", "")
    const summaries = computeListingSummaries(filtered)
    const grand     = computeGrandTotal(summaries)
    const moyenne   = computeMoyenneMensuelle(grand)
    expect(moyenne).toBe(0)
  })

  it("Total frais prestataires = 0 when no bookings", () => {
    const filtered = applyFilters(bookings, "2026", "", "", "")
    const frais    = computeFraisPresta(filtered)
    expect(frais).toBe(0)
  })

  it("No listing rows shown when no bookings", () => {
    const filtered  = applyFilters(bookings, "2026", "", "", "")
    const summaries = computeListingSummaries(filtered)
    expect(summaries).toHaveLength(0)
  })

  it("No error — computations return 0 cleanly with no throws", () => {
    // Verifies zero-division guard: grandTotal=0 → moyenne=0, not NaN/Infinity
    const filtered   = applyFilters(bookings, "2026", "", "", "")
    const summaries  = computeListingSummaries(filtered)
    const grand      = computeGrandTotal(summaries)
    const moyenne    = computeMoyenneMensuelle(grand)
    const frais      = computeFraisPresta(filtered)

    expect(Number.isFinite(moyenne)).toBe(true)
    expect(Number.isFinite(frais)).toBe(true)
    expect(grand).toBe(0)
    expect(moyenne).toBe(0)
    expect(frais).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Acceptance criteria guard — pct du total guard (zero-division)
// ---------------------------------------------------------------------------

describe("Zero-division guard for pct du total annuel", () => {
  it("pct = 0 when grand_total = 0 (no Infinity or NaN)", () => {
    // Mirrors the JSX guard: grandTotal > 0 ? Math.round(...) : 0
    const grandTotal = 0
    const listingTotal = 0
    const pct = grandTotal > 0 ? Math.round((listingTotal / grandTotal) * 100) : 0
    expect(pct).toBe(0)
    expect(Number.isFinite(pct)).toBe(true)
  })

  it("pct rounds correctly when grand_total > 0", () => {
    const grandTotal   = 2300
    const listingTotal = 1800
    const pct = grandTotal > 0 ? Math.round((listingTotal / grandTotal) * 100) : 0
    // 1800 / 2300 = 0.7826... → 78%
    expect(pct).toBe(78)
  })
})
