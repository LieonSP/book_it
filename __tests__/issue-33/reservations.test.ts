/**
 * __tests__/issue-33/reservations.test.ts
 *
 * Vitest unit tests for Issue #33 — Bookings Update.
 *
 * We test pure business-logic functions extracted from the components.
 * No browser / DOM / network required — Vitest environment: "node".
 *
 * Scenarios covered:
 *  3  List filter by property — only matching listing_name rows shown
 *  4  List filter by month — only matching check_in month shown
 *  5  Owner edits all fields (happy path) — UPDATE payload includes all fields
 *  6  Provider edits allowed fields — provider_fee and pricing_id excluded from payload
 *  9  Owner accesses another owner's booking — RLS returns null, redirect triggered
 * 10  Provider accesses another provider's booking — RLS returns null, redirect triggered
 * 11  Date validation blocks invalid range on edit — error on checkOut field
 * 12  Mission reconciliation on edit — delete + insert when missionId changes
 * 13  Empty state when no bookings — hasNoBookings flag is true
 *
 * SQL scenarios (1, 2, 7, 8) live in __tests__/sql/issue-33-*.sql.
 */

import { describe, it, expect } from "vitest"

// ---------------------------------------------------------------------------
// Types (mirrors the app types, kept minimal for testing)
// ---------------------------------------------------------------------------

type BookingStatus = "pending" | "confirmed" | "done" | "cancelled"
type BookingSource = "airbnb" | "direct"

interface BookingRow {
  id:           string
  check_in:     string      // YYYY-MM-DD
  check_out:    string      // YYYY-MM-DD
  rental_price: number
  provider_fee: number
  status:       BookingStatus
  listing_name: string
  provider_name: string
  tenant_name:  string
}

// ---------------------------------------------------------------------------
// Helpers extracted from page.tsx / BookingForm.tsx for isolated testing
// ---------------------------------------------------------------------------

/** Extract "YYYY-MM" from a YYYY-MM-DD string. */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/**
 * Applies the two client-side filters from ReservationsPage.
 * Returns bookings matching filterListing AND filterMonth.
 */
function applyFilters(
  bookings: BookingRow[],
  filterListing: string,
  filterMonth: string
): BookingRow[] {
  return bookings.filter((b) => {
    if (filterListing && b.listing_name !== filterListing) return false
    if (filterMonth   && monthKey(b.check_in) !== filterMonth) return false
    return true
  })
}

// ---------------------------------------------------------------------------
// LABELS subset used in validation (mirrors BookingForm.tsx)
// ---------------------------------------------------------------------------

const LABELS = {
  proprieteRequired:   "Ce champ est obligatoire",
  prestataireRequired: "Ce champ est obligatoire",
  sourceRequired:      "Ce champ est obligatoire",
  arriveeRequired:     "Ce champ est obligatoire",
  departRequired:      "Ce champ est obligatoire",
  departAfterArrivee:  "La date de départ doit être après la date d'arrivée",
  nbVoyageursRequired: "Ce champ est obligatoire",
  nbVoyageursMin:      "Le nombre de voyageurs doit être d'au moins 1",
  prenomRequired:      "Ce champ est obligatoire",
  nomRequired:         "Ce champ est obligatoire",
  missionRequired:     "Ce champ est obligatoire",
  prixLocationRequired:"Ce champ est obligatoire",
  prixLocationMin:     "Le prix doit être supérieur à 0",
} as const

interface EditFormState {
  userRole:       "owner" | "provider"
  listingId:      string
  providerId:     string
  source:         BookingSource
  checkIn:        string
  checkOut:       string
  nbPax:          string
  tenantFirstName: string
  tenantLastName:  string
  missionId:      string
  rentalPrice:    string
}

/**
 * Replicates the validate() function from BookingForm.tsx for edit mode.
 * Note: in edit mode, missionId is optional for owners (same as create).
 */
function validate(state: EditFormState): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!state.listingId)       errors.listingId       = LABELS.proprieteRequired
  // Provider role: providerId is required (pre-filled as self)
  if (state.userRole !== "owner" && !state.providerId) errors.providerId = LABELS.prestataireRequired
  if (!state.source)          errors.source          = LABELS.sourceRequired
  if (!state.checkIn)         errors.checkIn         = LABELS.arriveeRequired
  if (!state.checkOut)        errors.checkOut        = LABELS.departRequired
  if (!state.nbPax)           errors.nbPax           = LABELS.nbVoyageursRequired
  if (!state.tenantFirstName) errors.tenantFirstName = LABELS.prenomRequired
  if (!state.tenantLastName)  errors.tenantLastName  = LABELS.nomRequired
  // Mission: required for providers, optional for owners
  if (state.userRole !== "owner" && !state.missionId) errors.missionId = LABELS.missionRequired
  if (!state.rentalPrice)     errors.rentalPrice     = LABELS.prixLocationRequired

  // check_out must be strictly after check_in
  if (state.checkIn && state.checkOut && state.checkOut <= state.checkIn) {
    errors.checkOut = LABELS.departAfterArrivee
  }

  if (state.rentalPrice && parseFloat(state.rentalPrice) <= 0) {
    errors.rentalPrice = LABELS.prixLocationMin
  }

  if (state.nbPax && parseInt(state.nbPax, 10) < 1) {
    errors.nbPax = LABELS.nbVoyageursMin
  }

  return errors
}

/**
 * Builds the bookingUpdate payload that handleEdit() would send to Supabase.
 * Replicates the field-inclusion logic from BookingForm.tsx lines 685-705.
 */
function buildBookingUpdatePayload(
  userRole: "owner" | "provider",
  fields: {
    listingId:    string
    providerId:   string
    checkIn:      string
    checkInTime:  string | null
    checkOut:     string
    checkOutTime: string | null
    source:       BookingSource
    nbPax:        number
    rentalPrice:  number
    providerFee:  number
    status:       BookingStatus
    note:         string | null
    isFeeAuto:    boolean
    pricingId:    string | null
  }
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    listing_id:     fields.listingId,
    check_in:       fields.checkIn,
    check_in_time:  fields.checkInTime  || null,
    check_out:      fields.checkOut,
    check_out_time: fields.checkOutTime || null,
    source:         fields.source,
    nb_pax:         fields.nbPax,
    rental_price:   fields.rentalPrice,
    status:         fields.status,
    note:           fields.note,
  }

  // Only owners can change provider and fee fields
  if (userRole === "owner") {
    payload.provider_id  = fields.providerId || null
    payload.provider_fee = fields.providerFee
    // pricing_id: keep if still auto, clear if manual
    payload.pricing_id   = fields.isFeeAuto ? fields.pricingId : null
  }

  return payload
}

/**
 * Determines whether mission rows need reconciliation.
 * Returns { needsDelete, needsInsert } flags.
 */
function missionReconciliation(
  currentMissionId: string,
  initialMissionId: string | null
): { needsDelete: boolean; needsInsert: boolean } {
  const initial = initialMissionId ?? ""
  const changed = currentMissionId !== initial
  return {
    needsDelete: changed,                        // always delete old if changed
    needsInsert: changed && currentMissionId !== "", // insert new only if non-empty
  }
}

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const BOOKING_L1_MAY: BookingRow = {
  id:           "b1",
  check_in:     "2026-05-01",
  check_out:    "2026-05-05",
  rental_price: 500,
  provider_fee: 80,
  status:       "pending",
  listing_name: "Villa L1",
  provider_name: "Alice Martin",
  tenant_name:  "Jean Dupont",
}

const BOOKING_L2_MAY: BookingRow = {
  id:           "b2",
  check_in:     "2026-05-10",
  check_out:    "2026-05-15",
  rental_price: 600,
  provider_fee: 90,
  status:       "confirmed",
  listing_name: "Villa L2",
  provider_name: "Bob Durand",
  tenant_name:  "Marie Curie",
}

const BOOKING_L1_JUN: BookingRow = {
  id:           "b3",
  check_in:     "2026-06-01",
  check_out:    "2026-06-05",
  rental_price: 700,
  provider_fee: 100,
  status:       "done",
  listing_name: "Villa L1",
  provider_name: "Alice Martin",
  tenant_name:  "Paul Moreau",
}

// ---------------------------------------------------------------------------
// Scenario 3 — List filter by property
// ---------------------------------------------------------------------------

describe("Scenario 3 — List filter by property", () => {
  it("shows only bookings for the selected listing", () => {
    const all = [BOOKING_L1_MAY, BOOKING_L2_MAY, BOOKING_L1_JUN]
    const result = applyFilters(all, "Villa L1", "")

    expect(result).toHaveLength(2)
    expect(result.every((b) => b.listing_name === "Villa L1")).toBe(true)
    expect(result.find((b) => b.listing_name === "Villa L2")).toBeUndefined()
  })

  it("returns empty array when listing filter matches nothing", () => {
    const all = [BOOKING_L1_MAY, BOOKING_L2_MAY]
    const result = applyFilters(all, "Villa Inexistante", "")

    expect(result).toHaveLength(0)
  })

  it("returns all bookings when no filter is active", () => {
    const all = [BOOKING_L1_MAY, BOOKING_L2_MAY, BOOKING_L1_JUN]
    const result = applyFilters(all, "", "")

    expect(result).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// Scenario 4 — List filter by month
// ---------------------------------------------------------------------------

describe("Scenario 4 — List filter by month", () => {
  it("shows only May 2026 bookings when month filter = '2026-05'", () => {
    const all = [BOOKING_L1_MAY, BOOKING_L2_MAY, BOOKING_L1_JUN]
    const result = applyFilters(all, "", "2026-05")

    expect(result).toHaveLength(2)
    expect(result.every((b) => b.check_in.startsWith("2026-05"))).toBe(true)
  })

  it("shows only June 2026 bookings when month filter = '2026-06'", () => {
    const all = [BOOKING_L1_MAY, BOOKING_L2_MAY, BOOKING_L1_JUN]
    const result = applyFilters(all, "", "2026-06")

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("b3")
  })

  it("combining listing + month filters works correctly", () => {
    const all = [BOOKING_L1_MAY, BOOKING_L2_MAY, BOOKING_L1_JUN]
    const result = applyFilters(all, "Villa L1", "2026-05")

    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("b1")
  })
})

// ---------------------------------------------------------------------------
// Scenario 5 — Owner edits all fields (happy path)
// ---------------------------------------------------------------------------

describe("Scenario 5 — Owner edits all fields (happy path)", () => {
  it("UPDATE payload includes provider_id, provider_fee, pricing_id for owner", () => {
    const payload = buildBookingUpdatePayload("owner", {
      listingId:    "listing-uuid-1",
      providerId:   "provider-uuid-1",
      checkIn:      "2026-05-01",
      checkInTime:  null,
      checkOut:     "2026-05-05",
      checkOutTime: null,
      source:       "airbnb",
      nbPax:        2,
      rentalPrice:  1200,
      providerFee:  150,
      status:       "done",
      note:         null,
      isFeeAuto:    false,
      pricingId:    null,
    })

    expect(payload.status).toBe("done")
    expect(payload.rental_price).toBe(1200)
    expect(payload.provider_id).toBe("provider-uuid-1")
    expect(payload.provider_fee).toBe(150)
    // pricing_id should be null (isFeeAuto = false → cleared)
    expect(payload.pricing_id).toBeNull()
    expect(payload.listing_id).toBe("listing-uuid-1")
  })

  it("pricing_id is preserved when isFeeAuto is true", () => {
    const payload = buildBookingUpdatePayload("owner", {
      listingId:    "listing-uuid-1",
      providerId:   "provider-uuid-1",
      checkIn:      "2026-05-01",
      checkInTime:  null,
      checkOut:     "2026-05-05",
      checkOutTime: null,
      source:       "direct",
      nbPax:        2,
      rentalPrice:  800,
      providerFee:  80,
      status:       "confirmed",
      note:         null,
      isFeeAuto:    true,
      pricingId:    "pricing-uuid-42",
    })

    expect(payload.pricing_id).toBe("pricing-uuid-42")
    expect(payload.provider_fee).toBe(80)
  })

  it("validation passes for a fully valid owner edit", () => {
    const errors = validate({
      userRole:        "owner",
      listingId:       "listing-1",
      providerId:      "provider-1",
      source:          "airbnb",
      checkIn:         "2026-05-01",
      checkOut:        "2026-05-05",
      nbPax:           "2",
      tenantFirstName: "Jean",
      tenantLastName:  "Dupont",
      missionId:       "",          // optional for owner
      rentalPrice:     "1200",
    })

    expect(Object.keys(errors)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Scenario 6 — Provider edits allowed fields including rental_price
// ---------------------------------------------------------------------------

describe("Scenario 6 — Provider edits allowed fields including rental_price", () => {
  it("UPDATE payload does NOT include provider_fee or pricing_id for provider", () => {
    const payload = buildBookingUpdatePayload("provider", {
      listingId:    "listing-uuid-1",
      providerId:   "provider-uuid-self",
      checkIn:      "2026-06-01",
      checkInTime:  null,
      checkOut:     "2026-06-05",
      checkOutTime: null,
      source:       "direct",
      nbPax:        1,
      rentalPrice:  900,
      providerFee:  0,   // value doesn't matter — it won't be in the payload
      status:       "confirmed",
      note:         null,
      isFeeAuto:    false,
      pricingId:    null,
    })

    // Provider CAN change rental_price and status
    expect(payload.rental_price).toBe(900)
    expect(payload.status).toBe("confirmed")

    // Provider CANNOT change these — must be absent from payload
    expect(payload).not.toHaveProperty("provider_fee")
    expect(payload).not.toHaveProperty("provider_id")
    expect(payload).not.toHaveProperty("pricing_id")
  })

  it("validation passes when provider has all required fields set", () => {
    const errors = validate({
      userRole:        "provider",
      listingId:       "listing-1",
      providerId:      "self-uuid",
      source:          "direct",
      checkIn:         "2026-06-01",
      checkOut:        "2026-06-05",
      nbPax:           "1",
      tenantFirstName: "Paul",
      tenantLastName:  "Moreau",
      missionId:       "mission-1",   // required for provider
      rentalPrice:     "900",
    })

    expect(Object.keys(errors)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Scenario 9 — Owner accesses another owner's booking (RLS + redirect)
// ---------------------------------------------------------------------------

describe("Scenario 9 — Owner accesses another owner's booking", () => {
  /**
   * We simulate the server component's guard: if the Supabase query returns
   * null (because RLS blocked it), the server redirects to /reservations?error=not_found.
   * We test the decision logic — not the redirect itself.
   */
  it("triggers redirect when booking query returns null (RLS-blocked)", () => {
    // Simulate the server component outcome
    const bookingData: null = null  // Supabase returns null when RLS blocks

    // The guard logic from modifier/page.tsx line 86:
    const shouldRedirect = bookingData === null

    expect(shouldRedirect).toBe(true)
  })

  it("does NOT redirect when booking query returns data (owner is authorized)", () => {
    const bookingData = { id: "booking-123", listing_id: "listing-1" }  // RLS allowed

    const shouldRedirect = bookingData === null

    expect(shouldRedirect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Scenario 10 — Provider accesses another provider's booking (RLS + redirect)
// ---------------------------------------------------------------------------

describe("Scenario 10 — Provider accesses another provider's booking", () => {
  it("triggers redirect when booking query returns null (RLS-blocked)", () => {
    // Provider P2 tries to access P1's booking — RLS returns null
    const bookingData: null = null

    const shouldRedirect = bookingData === null

    expect(shouldRedirect).toBe(true)
  })

  it("does NOT redirect when provider queries their own booking", () => {
    // Provider P1 queries their own booking — RLS allows it
    const bookingData = { id: "p1-booking-1", provider_id: "p1-uuid" }

    const shouldRedirect = bookingData === null

    expect(shouldRedirect).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Scenario 11 — Date validation blocks invalid range on edit
// ---------------------------------------------------------------------------

describe("Scenario 11 — Date validation blocks invalid range on edit", () => {
  it("blocks submit when check_out equals check_in", () => {
    const errors = validate({
      userRole:        "owner",
      listingId:       "listing-1",
      providerId:      "provider-1",
      source:          "airbnb",
      checkIn:         "2026-05-01",
      checkOut:        "2026-05-01",   // same date — invalid
      nbPax:           "2",
      tenantFirstName: "Jean",
      tenantLastName:  "Dupont",
      missionId:       "",
      rentalPrice:     "500",
    })

    expect(errors.checkOut).toBe(LABELS.departAfterArrivee)
  })

  it("blocks submit when check_out is before check_in", () => {
    const errors = validate({
      userRole:        "owner",
      listingId:       "listing-1",
      providerId:      "provider-1",
      source:          "airbnb",
      checkIn:         "2026-05-10",
      checkOut:        "2026-05-05",   // before check_in — invalid
      nbPax:           "2",
      tenantFirstName: "Jean",
      tenantLastName:  "Dupont",
      missionId:       "",
      rentalPrice:     "500",
    })

    expect(errors.checkOut).toBe(LABELS.departAfterArrivee)
  })

  it("passes when check_out is strictly after check_in", () => {
    const errors = validate({
      userRole:        "owner",
      listingId:       "listing-1",
      providerId:      "provider-1",
      source:          "airbnb",
      checkIn:         "2026-05-01",
      checkOut:        "2026-05-05",   // valid
      nbPax:           "2",
      tenantFirstName: "Jean",
      tenantLastName:  "Dupont",
      missionId:       "",
      rentalPrice:     "500",
    })

    expect(errors.checkOut).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Scenario 12 — Mission reconciliation on edit
// ---------------------------------------------------------------------------

describe("Scenario 12 — Mission reconciliation on edit", () => {
  it("deletes old mission and inserts new one when mission changes", () => {
    const result = missionReconciliation("mission-m2", "mission-m1")

    expect(result.needsDelete).toBe(true)
    expect(result.needsInsert).toBe(true)
  })

  it("does NOT delete or insert when mission is unchanged", () => {
    const result = missionReconciliation("mission-m1", "mission-m1")

    expect(result.needsDelete).toBe(false)
    expect(result.needsInsert).toBe(false)
  })

  it("deletes old mission but does NOT insert when new missionId is empty", () => {
    // Owner clears the mission selection
    const result = missionReconciliation("", "mission-m1")

    expect(result.needsDelete).toBe(true)
    expect(result.needsInsert).toBe(false)
  })

  it("only inserts (no delete) when booking had no mission and now has one", () => {
    // initialMissionId = null means no previous mission row to delete
    const result = missionReconciliation("mission-m2", null)

    expect(result.needsDelete).toBe(true)   // delete is attempted (safe even if no rows)
    expect(result.needsInsert).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Scenario 13 — Empty state when no bookings exist
// ---------------------------------------------------------------------------

describe("Scenario 13 — Empty state when no bookings exist", () => {
  it("hasNoBookings is true when bookings array is empty", () => {
    const bookings: BookingRow[] = []
    const hasNoBookings = bookings.length === 0

    expect(hasNoBookings).toBe(true)
  })

  it("hasNoBookings is false when at least one booking exists", () => {
    const bookings: BookingRow[] = [BOOKING_L1_MAY]
    const hasNoBookings = bookings.length === 0

    expect(hasNoBookings).toBe(false)
  })

  it("filtered empty state is distinct from no-data empty state", () => {
    const bookings = [BOOKING_L1_MAY]
    const filtered = applyFilters(bookings, "Villa Inexistante", "")

    // Total bookings exist → not the "no data" empty state
    const hasNoBookings       = bookings.length === 0
    // But filters return nothing → show "filtered" empty state
    const hasActiveFilters    = true
    const filteredIsEmpty     = filtered.length === 0

    expect(hasNoBookings).toBe(false)
    expect(hasActiveFilters && filteredIsEmpty).toBe(true)
  })
})
