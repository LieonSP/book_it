/**
 * __tests__/issue-84-provider-notification.test.ts
 *
 * Vitest unit tests for Issue #84 — "Provider mission-assigned email
 * notification".
 *
 * Strategy:
 *  - Scenarios 1-5 exercise `shouldSendProviderAssignedEmail()` directly —
 *    it's a pure function, so no mocking is required at all.
 *  - Scenario 6 exercises the Route Handler's POST() function directly
 *    (not via HTTP), with `@/lib/supabase/server` and
 *    `@/lib/notifications/resend` mocked. This confirms the route's own
 *    try/catch around `sendProviderAssignedEmail()` actually swallows the
 *    failure and still responds 200 — the issue's "never block the booking
 *    save" requirement.
 *
 * Scenarios covered (numbers match the issue's own "Test scenarios" section):
 *  1  First assignment at creation sends the email
 *  2  First assignment at edit sends the email
 *  3  Reassignment does not send the email
 *  4  Cancelled booking does not send the email
 *  5  Unrelated field edit does not send the email
 *  6  Booking save succeeds even if the email API fails
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  shouldSendProviderAssignedEmail,
  type ProviderAssignmentTransition,
} from "../lib/notifications/provider-assigned"

const PROVIDER_A = "11111111-1111-1111-1111-111111111111"
const PROVIDER_B = "22222222-2222-2222-2222-222222222222"

// ---------------------------------------------------------------------------
// Scenarios 1-5 — pure decision function, no mocking needed
// ---------------------------------------------------------------------------

describe("shouldSendProviderAssignedEmail (issue #84 trigger rule)", () => {
  it("Scenario 1 — first assignment at creation (no prior provider) sends the email", () => {
    const transition: ProviderAssignmentTransition = {
      previousProviderId: null, // create mode always has no prior provider
      newProviderId: PROVIDER_A,
      status: "confirmed", // bookings are always inserted as "confirmed"
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(true)
  })

  it("Scenario 2 — first assignment at edit (provider_id NULL -> value) sends the email", () => {
    const transition: ProviderAssignmentTransition = {
      previousProviderId: null,
      newProviderId: PROVIDER_A,
      status: "confirmed",
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(true)
  })

  it("Scenario 3 — reassignment (provider A -> provider B) does not send the email", () => {
    const transition: ProviderAssignmentTransition = {
      previousProviderId: PROVIDER_A,
      newProviderId: PROVIDER_B,
      status: "confirmed",
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(false)
  })

  it("Scenario 4 — assigning a provider to a cancelled booking does not send the email", () => {
    const transition: ProviderAssignmentTransition = {
      previousProviderId: null,
      newProviderId: PROVIDER_A,
      status: "cancelled",
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(false)
  })

  it("edge case — assigning a provider to a done booking does not send the email", () => {
    // Not one of the issue's 6 numbered scenarios, but explicitly called out
    // in the issue's trigger rule ("cancelled or done") and in the Dev's own
    // comments about the status-remap gotcha — worth locking in directly.
    const transition: ProviderAssignmentTransition = {
      previousProviderId: null,
      newProviderId: PROVIDER_A,
      status: "done",
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(false)
  })

  it("Scenario 5 — unrelated field edit (provider_id untouched) does not send the email", () => {
    // Owner edits rental_price only; provider_id stays as Provider A both
    // before and after the save.
    const transition: ProviderAssignmentTransition = {
      previousProviderId: PROVIDER_A,
      newProviderId: PROVIDER_A,
      status: "confirmed",
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(false)
  })

  it("does not fire when no provider is being assigned at all (both null)", () => {
    const transition: ProviderAssignmentTransition = {
      previousProviderId: null,
      newProviderId: null,
      status: "confirmed",
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(false)
  })

  it("normalises the form's '' empty-uuid sentinel to null on both sides", () => {
    // BookingForm's <select> uses "" (not null) for "nothing selected".
    const transition: ProviderAssignmentTransition = {
      previousProviderId: "",
      newProviderId: PROVIDER_A,
      status: "confirmed",
    }
    expect(shouldSendProviderAssignedEmail(transition)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Scenario 6 — Route Handler: booking save (already committed) is never
// affected by a Resend failure.
// ---------------------------------------------------------------------------

// Mock the server Supabase client so POST() never touches next/headers or a
// real network — we control exactly what the "DB" returns.
const mockSingle = vi.fn()
const mockGetUser = vi.fn()

vi.mock("@/lib/supabase/server", () => {
  return {
    createClient: vi.fn(async () => ({
      auth: {
        getUser: mockGetUser,
      },
      from: vi.fn((table: string) => {
        if (table === "bookings") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: mockSingle,
          }
        }
        if (table === "users") {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn(async () => ({
              data: { email: "provider@example.com" },
              error: null,
            })),
          }
        }
        throw new Error(`Unexpected table in mock: ${table}`)
      }),
    })),
  }
})

// Force the Resend call to fail every time in this test file.
vi.mock("@/lib/notifications/resend", () => ({
  sendProviderAssignedEmail: vi.fn(async () => {
    throw new Error("simulated Resend outage")
  }),
}))

describe("POST /api/bookings/notify-provider-assigned (issue #84 failure isolation)", () => {
  beforeEach(() => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "owner-1" } } })
    mockSingle.mockResolvedValue({
      data: {
        id: "booking-1",
        provider_id: PROVIDER_A,
        status: "confirmed",
        check_in: "2026-10-01",
        check_out: "2026-10-05",
        provider_fee: 120,
        listings: { name: "Loft Bastille", address: "1 rue de la Paix", zip_code: "75011", city: "Paris" },
        booking_missions: [],
      },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it("Scenario 6 — responds 200 (sent: false) even though sendProviderAssignedEmail throws", async () => {
    const { POST } = await import("../app/api/bookings/notify-provider-assigned/route")
    const { NextRequest } = await import("next/server")

    const request = new NextRequest(
      "http://localhost/api/bookings/notify-provider-assigned",
      {
        method: "POST",
        body: JSON.stringify({ bookingId: "booking-1", previousProviderId: null }),
        headers: { "Content-Type": "application/json" },
      }
    )

    const response = await POST(request)
    const json = await response.json()

    // The booking write already happened before this endpoint is ever
    // called — this assertion is the issue's "never block/fail the save"
    // requirement, expressed as: this handler itself never throws and
    // never returns a non-200, even when the email API is down.
    expect(response.status).toBe(200)
    expect(json.ok).toBe(false)
    expect(json.sent).toBe(false)
    expect(json.reason).toBe("email_send_failed")
  })

  it("does not call sendProviderAssignedEmail at all when the trigger rule says no (reassignment)", async () => {
    const { sendProviderAssignedEmail } = await import("../lib/notifications/resend")
    const { POST } = await import("../app/api/bookings/notify-provider-assigned/route")
    const { NextRequest } = await import("next/server")

    // Booking already has PROVIDER_A post-save; caller claims the previous
    // value was PROVIDER_B -> reassignment, should not notify.
    const request = new NextRequest(
      "http://localhost/api/bookings/notify-provider-assigned",
      {
        method: "POST",
        body: JSON.stringify({ bookingId: "booking-1", previousProviderId: PROVIDER_B }),
        headers: { "Content-Type": "application/json" },
      }
    )

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.sent).toBe(false)
    expect(sendProviderAssignedEmail).not.toHaveBeenCalled()
  })
})
