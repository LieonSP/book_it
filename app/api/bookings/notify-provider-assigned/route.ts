/**
 * app/api/bookings/notify-provider-assigned/route.ts
 *
 * Route Handler for issue #84 — sends the provider a "you've been
 * assigned a mission" email the first time a booking's provider_id
 * goes from NULL to a real provider.
 *
 * WHY a Route Handler (not a Server Action, not a DB trigger):
 * BookingForm.tsx saves bookings directly from the browser via the
 * Supabase client — there's no existing Server Action in this flow to
 * hang the email call off. A Route Handler is the smallest change that
 * still keeps the Resend API key server-side only (it is NEVER sent to
 * the browser). The issue's own "Architecture decision" section calls
 * for "the email call ... issued after the bookings INSERT/UPDATE
 * succeeds — not a DB trigger + webhook", which this satisfies: the
 * booking write has already committed by the time BookingForm calls
 * this endpoint.
 *
 * WHY no service-role / admin client is needed here:
 * This endpoint uses the normal cookie-based server client
 * (lib/supabase/server.ts), which enforces RLS as the calling user.
 * That's sufficient because:
 *   - bookings_select already lets an owner read bookings on their
 *     own listings.
 *   - users_select already lets an owner read the users.email of any
 *     provider they manage (see supabase/migrations/20260410000000_
 *     rls_policies.sql, policy "users_select").
 * Issue #84's Definition of Done says "RLS policies: N/A — ... reuses
 * the existing owner-only write access ... already enforced by current
 * RLS" — so deliberately NOT reaching for the service role key here
 * keeps that true in the read path too.
 *
 * SECURITY / TRUST NOTE on `previousProviderId`:
 * By the time this route runs, the bookings UPDATE has already
 * committed — so the database only reflects the NEW provider_id, never
 * the old one. The caller (BookingForm, in edit mode) is the only place
 * that ever saw the pre-save value, so it has to tell us what it was.
 * This is explicitly the design called for in the issue ("BookingForm's
 * edit mode already receives initialData.providerId, so the 'old' value
 * ... is available client-side without an extra query"). Worst case if
 * a caller lied about this value: an extra email might fire to a
 * provider the caller's own owner already manages — no cross-tenant
 * data exposure, since every other field is still read server-side
 * under RLS.
 *
 * FAILURE ISOLATION:
 * This route ALWAYS responds 200 once past basic request validation,
 * even when nothing was sent (no provider, terminal status, missing
 * email, Resend down). BookingForm's caller doesn't need to branch on
 * the result — the booking save already succeeded before this endpoint
 * is even called, and this endpoint's own job is "best-effort notify,
 * log failures server-side, never make noise".
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  shouldSendProviderAssignedEmail,
  type BookingStatusForNotification,
} from "@/lib/notifications/provider-assigned"
import { sendProviderAssignedEmail } from "@/lib/notifications/resend"

/** Shape of a single row returned by the missions embed below. */
interface MissionEmbedRow {
  missions: { label: string } | { label: string }[] | null
}

export async function POST(request: NextRequest) {
  try {
    // -----------------------------------------------------------------
    // Parse + minimally validate the request body
    // -----------------------------------------------------------------
    const body = await request.json().catch(() => null)
    const bookingId =
      body && typeof body.bookingId === "string" ? body.bookingId : null
    const previousProviderId =
      body && typeof body.previousProviderId === "string"
        ? body.previousProviderId
        : null

    if (!bookingId) {
      return NextResponse.json(
        { ok: false, reason: "missing_booking_id" },
        { status: 400 }
      )
    }

    // -----------------------------------------------------------------
    // Auth: only a logged-in user can trigger this. RLS below does the
    // real scoping (they must actually be able to see this booking).
    // -----------------------------------------------------------------
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { ok: false, reason: "unauthenticated" },
        { status: 401 }
      )
    }

    // -----------------------------------------------------------------
    // Fetch the booking + listing + mission label(s).
    // RLS on `bookings` scopes this automatically — if the caller isn't
    // the owner of this booking's listing, the row (and thus the email)
    // simply won't exist from their point of view.
    // -----------------------------------------------------------------
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        provider_id,
        status,
        check_in,
        check_out,
        provider_fee,
        listings(name, address, zip_code, city),
        booking_missions(missions(label))
      `
      )
      .eq("id", bookingId)
      .single()

    if (bookingError || !booking) {
      console.error(
        "[notify-provider-assigned] booking not found or not visible to caller",
        { bookingId, bookingError }
      )
      // Not a client error — just nothing to send. Keep this a 200 so
      // BookingForm never has to treat it as a failed save.
      return NextResponse.json(
        { ok: true, sent: false, reason: "booking_not_found" },
        { status: 200 }
      )
    }

    // -----------------------------------------------------------------
    // Defense in depth: re-validate the trigger rule server-side using
    // the CURRENT (post-save) provider_id/status, rather than trusting
    // the client to only ever call this endpoint when it should.
    // -----------------------------------------------------------------
    const shouldSend = shouldSendProviderAssignedEmail({
      previousProviderId,
      newProviderId: booking.provider_id,
      status: booking.status as BookingStatusForNotification,
    })

    if (!shouldSend || !booking.provider_id) {
      return NextResponse.json({ ok: true, sent: false }, { status: 200 })
    }

    // -----------------------------------------------------------------
    // Look up the provider's email. Allowed under "users_select" RLS:
    // an owner can read the users.email row of any provider they manage.
    // users.email is NOT NULL in the schema, so no "provider has no
    // email" edge case to handle (per issue #84's own edge-case notes).
    // -----------------------------------------------------------------
    const { data: providerUser, error: providerError } = await supabase
      .from("users")
      .select("email")
      .eq("id", booking.provider_id)
      .single()

    if (providerError || !providerUser?.email) {
      console.error(
        "[notify-provider-assigned] could not resolve provider email",
        { providerId: booking.provider_id, providerError }
      )
      return NextResponse.json(
        { ok: false, sent: false, reason: "provider_email_not_found" },
        { status: 200 }
      )
    }

    // -----------------------------------------------------------------
    // Shape listing + mission data for the email body.
    // listings is a to-one embed (direct FK) so PostgREST may return it
    // as an object or a single-item array depending on the join type —
    // handle both, same pattern used elsewhere in BookingForm.tsx.
    // -----------------------------------------------------------------
    const listing = Array.isArray(booking.listings)
      ? booking.listings[0]
      : booking.listings

    const listingAddress = listing
      ? `${listing.address}, ${listing.zip_code} ${listing.city}`
      : null

    const missionLabels = ((booking.booking_missions ?? []) as MissionEmbedRow[])
      .map((row) => (Array.isArray(row.missions) ? row.missions[0] : row.missions))
      .map((m) => m?.label)
      .filter((label): label is string => Boolean(label))

    // -----------------------------------------------------------------
    // Send the email. Never let a Resend failure escape this handler —
    // log it server-side (this IS the server) and respond 200 regardless.
    // -----------------------------------------------------------------
    try {
      await sendProviderAssignedEmail({
        to: providerUser.email,
        listingName: listing?.name ?? "",
        listingAddress,
        checkIn: booking.check_in,
        checkOut: booking.check_out,
        missionLabels,
        providerFee: booking.provider_fee,
      })
    } catch (err) {
      console.error("[notify-provider-assigned] Resend call failed", err)
      return NextResponse.json(
        { ok: false, sent: false, reason: "email_send_failed" },
        { status: 200 }
      )
    }

    return NextResponse.json({ ok: true, sent: true }, { status: 200 })
  } catch (err) {
    // Catch-all: this endpoint must never throw an unhandled error back
    // at the caller, no matter what goes wrong.
    console.error("[notify-provider-assigned] unexpected error", err)
    return NextResponse.json(
      { ok: false, sent: false, reason: "unexpected_error" },
      { status: 200 }
    )
  }
}
