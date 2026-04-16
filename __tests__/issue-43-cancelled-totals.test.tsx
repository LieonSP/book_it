/**
 * __tests__/issue-43-cancelled-totals.test.tsx
 *
 * Unit tests for Issue #43 — Cancelled bookings excluded from section totals.
 *
 * Strategy: pure logic tests — no React rendering, no Supabase mocks.
 * We replicate the exact filtering and aggregation logic from app/reservations/page.tsx
 * and exercise it with controlled fixtures.
 *
 * Logic under test (extracted from groupedByListing.map in app/reservations/page.tsx):
 *   const activeRows = rows.filter((b) => b.status !== "cancelled")
 *   const total = activeRows.reduce((sum, b) => sum + b.rental_price, 0)
 *   const count = activeRows.length
 *   // rows (all statuses) is still used for rendering
 *
 * Scenarios:
 *   1 — Cancelled booking excluded from price total
 *   2 — Cancelled booking excluded from booking count
 *   3 — Cancelled rows still present in the rendered list (rows unchanged)
 *   4 — All bookings cancelled → 0 € total, "0 réservation"
 */

import { describe, it, expect } from "vitest"

// ---------------------------------------------------------------------------
// Types — mirrored from app/reservations/page.tsx
// ---------------------------------------------------------------------------

type BookingStatus = "pending" | "confirmed" | "done" | "cancelled"

interface BookingRow {
  id:           string
  check_in:     string
  check_out:    string
  rental_price: number
  provider_fee: number
  status:       BookingStatus
  listing_name: string
  provider_name: string
  tenant_name:  string
  note:         string | null
}

// ---------------------------------------------------------------------------
// Pure logic extracted from app/reservations/page.tsx (groupedByListing.map)
// ---------------------------------------------------------------------------

/**
 * Returns the active (non-cancelled) rows, total, and count for a group.
 * This mirrors exactly what the component computes in the section header.
 */
function computeGroupSummary(rows: BookingRow[]) {
  // Exclude cancelled bookings from header totals.
  // Cancelled rows still appear in the list below — we just don't
  // want them inflating the price total or booking count shown to the owner.
  const activeRows = rows.filter((b) => b.status !== "cancelled")
  const total      = activeRows.reduce((sum, b) => sum + b.rental_price, 0)
  const count      = activeRows.length
  return { activeRows, total, count, renderedRows: rows }
}

/**
 * Mirrors the LABELS.bookingCount helper from app/reservations/page.tsx.
 */
function bookingCount(n: number): string {
  return n === 1 ? "1 réservation" : `${n} réservations`
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeBooking(overrides: Partial<BookingRow> & { id: string }): BookingRow {
  return {
    check_in:     "2026-06-01",
    check_out:    "2026-06-08",
    rental_price: 500,
    provider_fee: 50,
    status:       "confirmed",
    listing_name: "L1",
    provider_name: "Alice Martin",
    tenant_name:  "Bob Dupont",
    note:         null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Scenario 1 — Cancelled booking excluded from price total
// ---------------------------------------------------------------------------

describe("Scenario 1 — Price total excludes cancelled bookings", () => {
  it("shows only the confirmed booking price when one booking is cancelled", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed", rental_price: 800 }),
      makeBooking({ id: "b2", status: "cancelled", rental_price: 200 }),
    ]

    const { total } = computeGroupSummary(rows)

    // Only the confirmed 800 € should count
    expect(total).toBe(800)
  })

  it("does not include the cancelled booking's price in the total", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed", rental_price: 800 }),
      makeBooking({ id: "b2", status: "cancelled", rental_price: 200 }),
    ]

    const { total } = computeGroupSummary(rows)

    // 800 + 200 = 1000 must NOT appear
    expect(total).not.toBe(1000)
  })
})

// ---------------------------------------------------------------------------
// Scenario 2 — Cancelled booking excluded from count
// ---------------------------------------------------------------------------

describe("Scenario 2 — Booking count excludes cancelled bookings", () => {
  it("counts only non-cancelled bookings", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed" }),
      makeBooking({ id: "b2", status: "cancelled" }),
    ]

    const { count } = computeGroupSummary(rows)

    expect(count).toBe(1)
  })

  it("renders '1 réservation' (singular) when 1 active booking", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed" }),
      makeBooking({ id: "b2", status: "cancelled" }),
    ]

    const { count } = computeGroupSummary(rows)
    const label = bookingCount(count)

    expect(label).toBe("1 réservation")
  })

  it("does not render '2 réservations' when one is cancelled", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed" }),
      makeBooking({ id: "b2", status: "cancelled" }),
    ]

    const { count } = computeGroupSummary(rows)
    const label = bookingCount(count)

    expect(label).not.toBe("2 réservations")
  })
})

// ---------------------------------------------------------------------------
// Scenario 3 — Cancelled rows still present in the rendered list
// ---------------------------------------------------------------------------

describe("Scenario 3 — Cancelled rows still render in the list", () => {
  it("renderedRows includes the cancelled booking", () => {
    const cancelledBooking = makeBooking({ id: "b2", status: "cancelled" })
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed" }),
      cancelledBooking,
    ]

    const { renderedRows } = computeGroupSummary(rows)

    // The cancelled booking must still be in renderedRows (used for the DOM list)
    expect(renderedRows).toHaveLength(2)
    expect(renderedRows.find((b) => b.id === "b2")).toBeDefined()
  })

  it("renderedRows length equals total rows including cancelled", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed" }),
      makeBooking({ id: "b2", status: "done" }),
      makeBooking({ id: "b3", status: "cancelled" }),
    ]

    const { renderedRows, count } = computeGroupSummary(rows)

    // count (active) < renderedRows.length (all)
    expect(renderedRows).toHaveLength(3)
    expect(count).toBe(2)
  })

  it("activeRows does not include the cancelled booking", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "confirmed" }),
      makeBooking({ id: "b2", status: "cancelled" }),
    ]

    const { activeRows, renderedRows } = computeGroupSummary(rows)

    // activeRows (header) excludes cancelled
    expect(activeRows.find((b) => b.id === "b2")).toBeUndefined()
    // renderedRows (list) includes cancelled
    expect(renderedRows.find((b) => b.id === "b2")).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 4 — All bookings cancelled
// ---------------------------------------------------------------------------

describe("Scenario 4 — All bookings cancelled", () => {
  it("total is 0 when all bookings are cancelled", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "cancelled", rental_price: 400 }),
      makeBooking({ id: "b2", status: "cancelled", rental_price: 600 }),
    ]

    const { total } = computeGroupSummary(rows)

    expect(total).toBe(0)
  })

  it("count is 0 when all bookings are cancelled", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "cancelled" }),
      makeBooking({ id: "b2", status: "cancelled" }),
    ]

    const { count } = computeGroupSummary(rows)

    expect(count).toBe(0)
  })

  it("renders '0 réservation' (plural form for 0) when all cancelled", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "cancelled" }),
      makeBooking({ id: "b2", status: "cancelled" }),
    ]

    const { count } = computeGroupSummary(rows)
    const label = bookingCount(count)

    // LABELS.bookingCount(0) → "0 réservations" (plural path)
    expect(label).toBe("0 réservations")
  })

  it("renderedRows still shows all cancelled rows in the list", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "cancelled" }),
      makeBooking({ id: "b2", status: "cancelled" }),
    ]

    const { renderedRows } = computeGroupSummary(rows)

    expect(renderedRows).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Bonus — non-cancelled statuses (pending, done) are included in totals
// ---------------------------------------------------------------------------

describe("Non-cancelled statuses included in totals", () => {
  it("includes pending bookings in total and count", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "pending",   rental_price: 300 }),
      makeBooking({ id: "b2", status: "confirmed", rental_price: 500 }),
      makeBooking({ id: "b3", status: "cancelled", rental_price: 100 }),
    ]

    const { total, count } = computeGroupSummary(rows)

    expect(total).toBe(800)  // 300 + 500 — cancelled excluded
    expect(count).toBe(2)
  })

  it("includes done bookings in total and count", () => {
    const rows: BookingRow[] = [
      makeBooking({ id: "b1", status: "done",      rental_price: 700 }),
      makeBooking({ id: "b2", status: "cancelled", rental_price: 200 }),
    ]

    const { total, count } = computeGroupSummary(rows)

    expect(total).toBe(700)
    expect(count).toBe(1)
  })
})
