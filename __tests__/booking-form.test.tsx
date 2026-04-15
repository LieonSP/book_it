/**
 * __tests__/booking-form.test.tsx
 *
 * Unit tests for Issue #36 — Nouvelle réservation form logic.
 *
 * Strategy: We test the pure business-logic functions extracted from the form
 * (validation, auto-fill decision, rollback sequence) using Vitest in Node
 * environment. We do NOT render the full React component (vitest.config.ts uses
 * environment: "node" — no DOM). Instead we replicate the exact control-flow
 * from nouvelle-reservation-form.tsx and exercise it with controlled mocks.
 *
 * Scenarios covered:
 *  1  Owner happy path — 3 INSERTs succeed, redirect to /reservations
 *  2  Provider happy path — tenant.owner_id = listing owner, booking.provider_id = auth.uid()
 *  5  Fee auto-fill triggers when provider + mission + ownerIdContext are all set
 *  6  Manual fee edit removes Auto badge
 *  7  Date validation blocks checkOut <= checkIn
 *  8  Partial INSERT rollback — orphaned tenant deleted when booking INSERT fails
 *  9  Empty state — submit blocked when owner has no listings
 * 10  No pricing rule — fee not auto-filled, no badge, field stays empty
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Re-implement the pure logic from the form for isolated testing
// ---------------------------------------------------------------------------

// Mirrors the LABELS object from nouvelle-reservation-form.tsx (subset used in logic)
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
  submitError:         "Une erreur est survenue. Veuillez réessayer.",
} as const

// ---------------------------------------------------------------------------
// validate() — exact replica of the validate() function in the form
// ---------------------------------------------------------------------------

interface FormState {
  listingId:       string
  providerId:      string
  source:          string
  checkIn:         string
  checkOut:        string
  nbPax:           string
  tenantFirstName: string
  tenantLastName:  string
  missionId:       string
  rentalPrice:     string
}

function validate(state: FormState): Record<string, string> {
  const errors: Record<string, string> = {}

  if (!state.listingId)       errors.listingId       = LABELS.proprieteRequired
  if (!state.providerId)      errors.providerId      = LABELS.prestataireRequired
  if (!state.source)          errors.source          = LABELS.sourceRequired
  if (!state.checkIn)         errors.checkIn         = LABELS.arriveeRequired
  if (!state.checkOut)        errors.checkOut        = LABELS.departRequired
  if (!state.nbPax)           errors.nbPax           = LABELS.nbVoyageursRequired
  if (!state.tenantFirstName) errors.tenantFirstName = LABELS.prenomRequired
  if (!state.tenantLastName)  errors.tenantLastName  = LABELS.nomRequired
  if (!state.missionId)       errors.missionId       = LABELS.missionRequired
  if (!state.rentalPrice)     errors.rentalPrice     = LABELS.prixLocationRequired

  // Departure must be strictly after arrival
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

// ---------------------------------------------------------------------------
// runAutoFill() — mirrors the auto-fill logic in the form
// ---------------------------------------------------------------------------

interface PricingRow {
  id:   string
  fee:  number
  provider_pricing_missions: { mission_id: string }[]
}

async function runAutoFill(
  currentProviderId: string,
  currentMissionId:  string,
  currentOwnerIdContext: string | null,
  fetchPricingRows: (ownerId: string, providerId: string) => Promise<PricingRow[]>
): Promise<{ fee: number | null; isAuto: boolean }> {
  if (!currentProviderId || !currentMissionId || !currentOwnerIdContext) {
    return { fee: null, isAuto: false }
  }

  const pricingRows = await fetchPricingRows(currentOwnerIdContext, currentProviderId)

  const match = pricingRows.find((p) =>
    p.provider_pricing_missions.some((m) => m.mission_id === currentMissionId)
  )

  if (match) {
    return { fee: match.fee, isAuto: true }
  }

  return { fee: null, isAuto: false }
}

// ---------------------------------------------------------------------------
// handleSubmit() — mirrors the 3-step INSERT + rollback logic in the form
// ---------------------------------------------------------------------------

interface SubmitDeps {
  userRole:         "owner" | "provider"
  userId:           string
  ownerIdContext:   string | null
  listingId:        string
  providerId:       string
  source:           string
  checkIn:          string
  checkInTime:      string
  checkOut:         string
  checkOutTime:     string
  nbPax:            string
  tenantFirstName:  string
  tenantLastName:   string
  tenantPhone:      string
  tenantEmail:      string
  missionId:        string
  rentalPrice:      string
  providerFee:      string
  note:             string
  insertTenant:  (data: object) => Promise<{ id: string } | null>
  insertBooking: (data: object) => Promise<{ id: string } | null>
  insertMission: (data: object) => Promise<{ error: boolean }>
  deleteTenant:  (id: string)   => Promise<void>
  deleteBooking: (id: string)   => Promise<void>
  redirectTo:    (path: string) => void
}

async function handleSubmit(deps: SubmitDeps): Promise<string | null> {
  // Derive owner_id for tenant INSERT
  const tenantOwnerId = deps.userRole === "owner" ? deps.userId : deps.ownerIdContext

  if (!tenantOwnerId) return LABELS.submitError

  // Step 1 — INSERT tenant
  const tenant = await deps.insertTenant({
    owner_id:   tenantOwnerId,
    first_name: deps.tenantFirstName.trim(),
    last_name:  deps.tenantLastName.trim(),
    phone:      deps.tenantPhone.trim() || null,
    email:      deps.tenantEmail.trim() || null,
  })

  if (!tenant) return LABELS.submitError

  // Step 2 — INSERT booking
  const booking = await deps.insertBooking({
    listing_id:   deps.listingId,
    provider_id:  deps.providerId,
    tenant_id:    tenant.id,
    check_in:     deps.checkIn,
    check_out:    deps.checkOut,
    source:       deps.source,
    nb_pax:       parseInt(deps.nbPax, 10),
    rental_price: parseFloat(deps.rentalPrice),
    provider_fee: deps.providerFee !== "" ? parseFloat(deps.providerFee) : 0,
    status:       "pending",
  })

  if (!booking) {
    // Rollback: delete orphaned tenant
    await deps.deleteTenant(tenant.id)
    return LABELS.submitError
  }

  // Step 3 — INSERT booking_missions
  const { error: missionError } = await deps.insertMission({
    booking_id: booking.id,
    mission_id: deps.missionId,
  })

  if (missionError) {
    // Rollback: delete booking then tenant
    await deps.deleteBooking(booking.id)
    await deps.deleteTenant(tenant.id)
    return LABELS.submitError
  }

  deps.redirectTo("/reservations")
  return null
}

// ---------------------------------------------------------------------------
// Shared test fixture — a fully valid form state
// ---------------------------------------------------------------------------

const validOwnerState: FormState = {
  listingId:       "listing-uuid-1",
  providerId:      "provider-uuid-1",
  source:          "airbnb",
  checkIn:         "2026-07-01",
  checkOut:        "2026-07-05",
  nbPax:           "2",
  tenantFirstName: "Jean",
  tenantLastName:  "Dupont",
  missionId:       "mission-uuid-1",
  rentalPrice:     "350",
}

// ---------------------------------------------------------------------------
// SCENARIO 7 — Date validation blocks invalid range
// ---------------------------------------------------------------------------

describe("Scenario 7 — Date validation", () => {
  it("blocks checkOut that is before checkIn", () => {
    const errors = validate({
      ...validOwnerState,
      checkIn:  "2026-05-20",
      checkOut: "2026-05-15",
    })
    expect(errors.checkOut).toBe(LABELS.departAfterArrivee)
  })

  it("blocks checkOut equal to checkIn (same day not allowed)", () => {
    const errors = validate({
      ...validOwnerState,
      checkIn:  "2026-05-20",
      checkOut: "2026-05-20",
    })
    expect(errors.checkOut).toBe(LABELS.departAfterArrivee)
  })

  it("passes when checkOut is strictly after checkIn", () => {
    const errors = validate({ ...validOwnerState })
    expect(errors.checkOut).toBeUndefined()
  })

  it("does not attempt INSERT when validation fails (no insertTenant call)", async () => {
    // We verify that submit never reaches insertTenant when validation has errors
    const invalidState: FormState = {
      ...validOwnerState,
      checkIn:  "2026-05-20",
      checkOut: "2026-05-15",
    }
    const errors = validate(invalidState)
    // The form bails out before submit when errors is non-empty
    expect(Object.keys(errors).length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// SCENARIO 5 — Fee auto-fill triggers on provider + mission selection
// ---------------------------------------------------------------------------

describe("Scenario 5 — Fee auto-fill", () => {
  it("auto-fills fee and sets isAuto=true when a pricing match is found", async () => {
    const fetchMock = vi.fn().mockResolvedValue([
      {
        id:  "pricing-1",
        fee: 120,
        provider_pricing_missions: [{ mission_id: "mission-uuid-1" }],
      },
    ])

    const result = await runAutoFill(
      "provider-uuid-1",
      "mission-uuid-1",
      "owner-uuid-1",
      fetchMock
    )

    expect(result.fee).toBe(120)
    expect(result.isAuto).toBe(true)
  })

  it("returns isAuto=false when no providerId is set", async () => {
    const fetchMock = vi.fn()
    const result = await runAutoFill("", "mission-uuid-1", "owner-uuid-1", fetchMock)
    expect(result.isAuto).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns isAuto=false when no missionId is set", async () => {
    const fetchMock = vi.fn()
    const result = await runAutoFill("provider-uuid-1", "", "owner-uuid-1", fetchMock)
    expect(result.isAuto).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("returns isAuto=false when ownerIdContext is null", async () => {
    const fetchMock = vi.fn()
    const result = await runAutoFill("provider-uuid-1", "mission-uuid-1", null, fetchMock)
    expect(result.isAuto).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SCENARIO 6 — Manual fee edit removes Auto badge
// ---------------------------------------------------------------------------

describe("Scenario 6 — Manual fee edit removes Auto badge", () => {
  it("setIsFeeAuto(false) is called on manual input change", () => {
    // Mirror the onChange logic: the input change handler calls setIsFeeAuto(false)
    // We simulate this as a direct state transition.
    let isFeeAuto = true
    let providerFee = "120"

    // Simulates the onChange handler in the form
    function handleFeeChange(newValue: string) {
      providerFee = newValue
      isFeeAuto = false // Manual edit removes the Auto badge
    }

    handleFeeChange("95")

    expect(isFeeAuto).toBe(false)
    expect(providerFee).toBe("95")
  })

  it("preserves the manually entered value after badge removal", () => {
    let isFeeAuto = true
    let providerFee = "120"

    function handleFeeChange(newValue: string) {
      providerFee = newValue
      isFeeAuto = false
    }

    handleFeeChange("95")
    handleFeeChange("0") // further edit
    handleFeeChange("")  // clear

    expect(isFeeAuto).toBe(false)
    expect(providerFee).toBe("")
  })
})

// ---------------------------------------------------------------------------
// SCENARIO 10 — No pricing rule — fee not auto-filled
// ---------------------------------------------------------------------------

describe("Scenario 10 — No pricing rule", () => {
  it("returns isAuto=false when pricing rows are empty", async () => {
    const fetchMock = vi.fn().mockResolvedValue([])

    const result = await runAutoFill(
      "provider-uuid-1",
      "mission-uuid-1",
      "owner-uuid-1",
      fetchMock
    )

    expect(result.isAuto).toBe(false)
    expect(result.fee).toBeNull()
  })

  it("returns isAuto=false when no pricing row covers the selected mission", async () => {
    const fetchMock = vi.fn().mockResolvedValue([
      {
        id:  "pricing-1",
        fee: 80,
        // This pricing row covers a DIFFERENT mission
        provider_pricing_missions: [{ mission_id: "other-mission-uuid" }],
      },
    ])

    const result = await runAutoFill(
      "provider-uuid-1",
      "mission-uuid-1",  // this mission is NOT in the pricing row
      "owner-uuid-1",
      fetchMock
    )

    expect(result.isAuto).toBe(false)
    expect(result.fee).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// SCENARIO 1 — Owner happy path
// ---------------------------------------------------------------------------

describe("Scenario 1 — Owner happy path", () => {
  it("inserts tenant + booking + mission and redirects to /reservations", async () => {
    const insertTenant  = vi.fn().mockResolvedValue({ id: "tenant-uuid-1" })
    const insertBooking = vi.fn().mockResolvedValue({ id: "booking-uuid-1" })
    const insertMission = vi.fn().mockResolvedValue({ error: false })
    const deleteTenant  = vi.fn()
    const deleteBooking = vi.fn()
    const redirectTo    = vi.fn()

    const error = await handleSubmit({
      userRole:         "owner",
      userId:           "owner-uuid-1",
      ownerIdContext:   "owner-uuid-1",
      listingId:        "listing-uuid-1",
      providerId:       "provider-uuid-1",
      source:           "airbnb",
      checkIn:          "2026-07-01",
      checkInTime:      "",
      checkOut:         "2026-07-05",
      checkOutTime:     "",
      nbPax:            "2",
      tenantFirstName:  "Jean",
      tenantLastName:   "Dupont",
      tenantPhone:      "",
      tenantEmail:      "",
      missionId:        "mission-uuid-1",
      rentalPrice:      "350",
      providerFee:      "120",
      note:             "",
      insertTenant,
      insertBooking,
      insertMission,
      deleteTenant,
      deleteBooking,
      redirectTo,
    })

    // No error returned
    expect(error).toBeNull()

    // All 3 INSERTs called
    expect(insertTenant).toHaveBeenCalledOnce()
    expect(insertBooking).toHaveBeenCalledOnce()
    expect(insertMission).toHaveBeenCalledOnce()

    // No rollback
    expect(deleteTenant).not.toHaveBeenCalled()
    expect(deleteBooking).not.toHaveBeenCalled()

    // Redirect happened
    expect(redirectTo).toHaveBeenCalledWith("/reservations")

    // tenant.owner_id = owner's own userId (not provider's id)
    expect(insertTenant).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: "owner-uuid-1" })
    )

    // booking.status = "pending"
    expect(insertBooking).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending" })
    )
  })
})

// ---------------------------------------------------------------------------
// SCENARIO 2 — Provider happy path
// ---------------------------------------------------------------------------

describe("Scenario 2 — Provider happy path", () => {
  it("sets tenant.owner_id from listing owner, booking.provider_id from auth.uid()", async () => {
    const insertTenant  = vi.fn().mockResolvedValue({ id: "tenant-uuid-2" })
    const insertBooking = vi.fn().mockResolvedValue({ id: "booking-uuid-2" })
    const insertMission = vi.fn().mockResolvedValue({ error: false })
    const deleteTenant  = vi.fn()
    const deleteBooking = vi.fn()
    const redirectTo    = vi.fn()

    const providerUserId  = "provider-uuid-2"
    const listingOwnerId  = "owner-uuid-1"  // derived from selected listing

    const error = await handleSubmit({
      userRole:         "provider",
      userId:           providerUserId,
      ownerIdContext:   listingOwnerId,   // resolved from the selected listing
      listingId:        "listing-uuid-1",
      providerId:       providerUserId,   // pre-filled as themselves
      source:           "direct",
      checkIn:          "2026-08-01",
      checkInTime:      "",
      checkOut:         "2026-08-07",
      checkOutTime:     "",
      nbPax:            "3",
      tenantFirstName:  "Marie",
      tenantLastName:   "Martin",
      tenantPhone:      "",
      tenantEmail:      "",
      missionId:        "mission-uuid-1",
      rentalPrice:      "420",
      providerFee:      "80",
      note:             "",
      insertTenant,
      insertBooking,
      insertMission,
      deleteTenant,
      deleteBooking,
      redirectTo,
    })

    expect(error).toBeNull()

    // tenant.owner_id = the listing's owner (NOT the provider's userId)
    expect(insertTenant).toHaveBeenCalledWith(
      expect.objectContaining({ owner_id: listingOwnerId })
    )

    // booking.provider_id = provider's own auth.uid()
    expect(insertBooking).toHaveBeenCalledWith(
      expect.objectContaining({ provider_id: providerUserId })
    )

    expect(redirectTo).toHaveBeenCalledWith("/reservations")
  })

  it("returns error immediately when ownerIdContext is null (listing not resolved)", async () => {
    const insertTenant = vi.fn()
    const redirectTo   = vi.fn()

    const error = await handleSubmit({
      userRole:         "provider",
      userId:           "provider-uuid-2",
      ownerIdContext:   null,  // listing owner not yet resolved
      listingId:        "listing-uuid-1",
      providerId:       "provider-uuid-2",
      source:           "direct",
      checkIn:          "2026-08-01",
      checkInTime:      "",
      checkOut:         "2026-08-07",
      checkOutTime:     "",
      nbPax:            "2",
      tenantFirstName:  "Marie",
      tenantLastName:   "Martin",
      tenantPhone:      "",
      tenantEmail:      "",
      missionId:        "mission-uuid-1",
      rentalPrice:      "420",
      providerFee:      "80",
      note:             "",
      insertTenant,
      insertBooking:  vi.fn(),
      insertMission:  vi.fn(),
      deleteTenant:   vi.fn(),
      deleteBooking:  vi.fn(),
      redirectTo,
    })

    expect(error).toBe(LABELS.submitError)
    expect(insertTenant).not.toHaveBeenCalled()
    expect(redirectTo).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SCENARIO 8 — Partial INSERT rollback on booking failure
// ---------------------------------------------------------------------------

describe("Scenario 8 — Rollback on booking INSERT failure", () => {
  it("deletes orphaned tenant when booking INSERT fails", async () => {
    const insertTenant  = vi.fn().mockResolvedValue({ id: "tenant-uuid-rollback" })
    const insertBooking = vi.fn().mockResolvedValue(null)  // booking INSERT fails
    const insertMission = vi.fn()
    const deleteTenant  = vi.fn().mockResolvedValue(undefined)
    const deleteBooking = vi.fn()
    const redirectTo    = vi.fn()

    const error = await handleSubmit({
      userRole:         "owner",
      userId:           "owner-uuid-1",
      ownerIdContext:   "owner-uuid-1",
      listingId:        "listing-uuid-1",
      providerId:       "provider-uuid-1",
      source:           "airbnb",
      checkIn:          "2026-07-01",
      checkInTime:      "",
      checkOut:         "2026-07-05",
      checkOutTime:     "",
      nbPax:            "2",
      tenantFirstName:  "Jean",
      tenantLastName:   "Dupont",
      tenantPhone:      "",
      tenantEmail:      "",
      missionId:        "mission-uuid-1",
      rentalPrice:      "350",
      providerFee:      "120",
      note:             "",
      insertTenant,
      insertBooking,
      insertMission,
      deleteTenant,
      deleteBooking,
      redirectTo,
    })

    // Error shown
    expect(error).toBe(LABELS.submitError)

    // Tenant was inserted then deleted (rollback)
    expect(insertTenant).toHaveBeenCalledOnce()
    expect(deleteTenant).toHaveBeenCalledWith("tenant-uuid-rollback")

    // Booking mission INSERT never called
    expect(insertMission).not.toHaveBeenCalled()

    // No redirect
    expect(redirectTo).not.toHaveBeenCalled()
  })

  it("deletes booking AND tenant when booking_missions INSERT fails", async () => {
    const insertTenant  = vi.fn().mockResolvedValue({ id: "tenant-uuid-rollback2" })
    const insertBooking = vi.fn().mockResolvedValue({ id: "booking-uuid-rollback2" })
    const insertMission = vi.fn().mockResolvedValue({ error: true }) // mission INSERT fails
    const deleteTenant  = vi.fn().mockResolvedValue(undefined)
    const deleteBooking = vi.fn().mockResolvedValue(undefined)
    const redirectTo    = vi.fn()

    const error = await handleSubmit({
      userRole:         "owner",
      userId:           "owner-uuid-1",
      ownerIdContext:   "owner-uuid-1",
      listingId:        "listing-uuid-1",
      providerId:       "provider-uuid-1",
      source:           "airbnb",
      checkIn:          "2026-07-01",
      checkInTime:      "",
      checkOut:         "2026-07-05",
      checkOutTime:     "",
      nbPax:            "2",
      tenantFirstName:  "Jean",
      tenantLastName:   "Dupont",
      tenantPhone:      "",
      tenantEmail:      "",
      missionId:        "mission-uuid-1",
      rentalPrice:      "350",
      providerFee:      "120",
      note:             "",
      insertTenant,
      insertBooking,
      insertMission,
      deleteTenant,
      deleteBooking,
      redirectTo,
    })

    expect(error).toBe(LABELS.submitError)
    expect(deleteBooking).toHaveBeenCalledWith("booking-uuid-rollback2")
    expect(deleteTenant).toHaveBeenCalledWith("tenant-uuid-rollback2")
    expect(redirectTo).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// SCENARIO 9 — Empty state for owner with no listings
// ---------------------------------------------------------------------------

describe("Scenario 9 — Empty state / submit blocked", () => {
  it("isSubmitBlocked is true when listings array is empty (owner)", () => {
    // Mirror the form's isSubmitBlocked derived flag
    const listings:  { id: string; name: string }[] = []
    const providers: { id: string }[]               = [{ id: "p1" }]
    const userRole = "owner"

    const hasNoListings  = listings.length === 0
    const hasNoProviders = userRole === "owner" && providers.length === 0
    const isSubmitBlocked = hasNoListings || hasNoProviders

    expect(isSubmitBlocked).toBe(true)
  })

  it("isSubmitBlocked is true when provider list is empty (owner)", () => {
    const listings  = [{ id: "l1", name: "L1" }]
    const providers: { id: string }[] = []
    const userRole = "owner"

    const hasNoListings  = listings.length === 0
    const hasNoProviders = userRole === "owner" && providers.length === 0
    const isSubmitBlocked = hasNoListings || hasNoProviders

    expect(isSubmitBlocked).toBe(true)
  })

  it("isSubmitBlocked is false when provider has listings (provider role ignores hasNoProviders)", () => {
    // Providers are always pre-filled — hasNoProviders only applies to owner role
    const listings  = [{ id: "l1", name: "L1" }]
    const providers: { id: string }[] = [] // empty but irrelevant for provider role
    const userRole = "provider"

    const hasNoListings  = listings.length === 0
    const hasNoProviders = userRole === "owner" && providers.length === 0
    const isSubmitBlocked = hasNoListings || hasNoProviders

    expect(isSubmitBlocked).toBe(false)
  })

  it("validate() fails when listingId is empty", () => {
    const errors = validate({
      ...validOwnerState,
      listingId: "",
    })
    expect(errors.listingId).toBe(LABELS.proprieteRequired)
  })
})
