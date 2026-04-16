"use client"

/**
 * app/reservations/nouvelle/nouvelle-reservation-form.tsx
 *
 * Thin wrapper that renders BookingForm in create mode.
 *
 * WHY a separate file: the Server Component (page.tsx) imports this by name,
 * keeping the existing import path stable while the form logic lives in the
 * shared BookingForm component.
 *
 * All form logic, state, and UI now live in:
 *   app/reservations/_components/BookingForm.tsx
 */

import { BookingForm } from "../_components/BookingForm"

interface Props {
  userId:    string
  userRole:  "owner" | "provider"
  firstName: string
}

export function NouvelleReservationForm({ userId, userRole, firstName }: Props) {
  return (
    <BookingForm
      mode="create"
      userId={userId}
      userRole={userRole}
      firstName={firstName}
    />
  )
}
