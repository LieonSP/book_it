/**
 * app/reservations/[id]/modifier/page.tsx
 *
 * Server Component wrapper for the booking edit page.
 *
 * WHY a Server Component:
 * - Validates the session and fetches the user's role securely on the server,
 *   avoiding a client-side round-trip that would cause a layout flash.
 * - Fetches the booking data server-side so the form pre-fills instantly.
 * - If RLS blocks the query (user doesn't own/assigned to this booking),
 *   the redirect happens before the client ever sees the page.
 *
 * SECURITY:
 * - RLS on `bookings` prevents any user from reading a booking they don't
 *   have access to. The server component acts as the first line of defence.
 * - If the query returns no rows, we redirect to /reservations?error=not_found
 *   so the list page can show an error toast.
 */

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { BookingForm, type BookingInitialData } from "../../_components/BookingForm"

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function ModifierReservationPage({ params }: PageProps) {
  // Await the params object — required in Next.js 15+ where params is a Promise
  const { id } = await params

  // Server-side Supabase client — reads session from cookies
  const supabase = await createClient()

  // Validate session
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect("/login")
  }

  // Fetch role + first name
  const { data: profile, error: profileError } = await supabase
    .from("users")
    .select("type, first_name")
    .eq("id", user.id)
    .single()

  if (profileError || !profile) {
    redirect("/login")
  }

  // -----------------------------------------------------------------------
  // Fetch booking with tenant + mission.
  //
  // RLS automatically scopes this query:
  //   Owner → only bookings on their listings
  //   Provider → only bookings assigned to them
  //
  // If the query returns null (RLS blocked it or ID doesn't exist):
  //   redirect to /reservations?error=not_found
  // -----------------------------------------------------------------------
  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select(`
      id,
      listing_id,
      provider_id,
      tenant_id,
      pricing_id,
      check_in,
      check_in_time,
      check_out,
      check_out_time,
      source,
      nb_pax,
      rental_price,
      provider_fee,
      status,
      note,
      tenants!inner(first_name, last_name, phone, email),
      booking_missions(mission_id)
    `)
    .eq("id", id)
    .single()

  if (bookingError || !booking) {
    // RLS blocked the query or booking not found — redirect with error signal
    redirect("/reservations?error=not_found")
  }

  // -----------------------------------------------------------------------
  // Fetch provider name separately (the bookings query joins users!provider_id
  // but that requires a hint; easier to do a second small query here).
  // -----------------------------------------------------------------------
  let providerName = ""
  if (booking.provider_id) {
    const { data: providerUser } = await supabase
      .from("users")
      .select("first_name, last_name")
      .eq("id", booking.provider_id)
      .single()

    if (providerUser) {
      providerName = `${providerUser.first_name} ${providerUser.last_name ?? ""}`.trim()
    }
  }

  // -----------------------------------------------------------------------
  // Shape the data into BookingInitialData for the shared BookingForm
  // -----------------------------------------------------------------------

  // tenants may be returned as an array by PostgREST even with !inner join
  const tenant = Array.isArray(booking.tenants) ? booking.tenants[0] : booking.tenants

  // booking_missions is an array; we take the first (v0 allows 1 mission per booking)
  const missionRow = Array.isArray(booking.booking_missions)
    ? booking.booking_missions[0]
    : booking.booking_missions

  const initialData: BookingInitialData = {
    id:           booking.id,
    listingId:    booking.listing_id,
    providerId:   booking.provider_id ?? "",
    providerName: providerName,
    tenantId:     booking.tenant_id,
    tenant: {
      firstName: tenant?.first_name ?? "",
      lastName:  tenant?.last_name  ?? "",
      phone:     tenant?.phone      ?? null,
      email:     tenant?.email      ?? null,
    },
    pricingId:    booking.pricing_id    ?? null,
    checkIn:      booking.check_in,
    checkInTime:  booking.check_in_time ?? null,
    checkOut:     booking.check_out,
    checkOutTime: booking.check_out_time ?? null,
    source:       booking.source as "airbnb" | "direct",
    nbPax:        booking.nb_pax,
    rentalPrice:  booking.rental_price,
    providerFee:  booking.provider_fee,
    status:       booking.status as "pending" | "confirmed" | "done" | "cancelled",
    note:         booking.note ?? null,
    missionId:    missionRow?.mission_id ?? null,
  }

  return (
    <BookingForm
      mode="edit"
      userId={user.id}
      userRole={profile.type as "owner" | "provider"}
      firstName={profile.first_name}
      initialData={initialData}
    />
  )
}
