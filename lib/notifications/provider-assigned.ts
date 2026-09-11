/**
 * lib/notifications/provider-assigned.ts
 *
 * Pure decision logic for issue #84 — "Provider mission-assigned email
 * notification" (a training exercise showing how to call a third-party
 * API from server-side app code).
 *
 * WHY a pure function with no side effects (no network, no Supabase):
 * The trigger rule has several easy-to-get-wrong edge cases —
 * reassignment, terminal booking status, edits that never touch
 * provider_id at all. Keeping the decision as one small, deterministic
 * function means every rule lives in ONE place and can be exhaustively
 * unit-tested with plain inputs/outputs, no mocking required. This is
 * also what makes every "Test scenarios" case in the issue directly
 * testable: each one is just a call to this function with different
 * arguments.
 */

/** The booking status enum as stored in the database. */
export type BookingStatusForNotification =
  | "pending"
  | "confirmed"
  | "done"
  | "cancelled"

export interface ProviderAssignmentTransition {
  /**
   * provider_id BEFORE this save. `null` (or `""`, the form's empty-uuid
   * sentinel — see BUG-012 in the bug ledger) means "no provider assigned
   * yet". For a brand-new booking (create mode) this is always `null`,
   * since there is no prior row.
   */
  previousProviderId: string | null
  /** provider_id AFTER this save — the value actually being written. */
  newProviderId: string | null
  /**
   * The booking's status to evaluate against the terminal-state rule.
   *
   * IMPORTANT for edit mode: this must be the status the booking had
   * BEFORE this edit (i.e. its status "at the moment of assignment"),
   * not whatever value the edit form's Statut dropdown ends up
   * submitting. BookingForm silently remaps a `done` booking's dropdown
   * default to `confirmed` on load (see BookingForm.tsx's `status` state
   * initialiser) purely for UI purposes — using the *original* DB status
   * here keeps the "done bookings never notify" rule correct even though
   * the value being saved may itself now read "confirmed".
   */
  status: BookingStatusForNotification
}

/**
 * Returns true only when a booking transitions from "no provider"
 * straight to "a provider", and the booking isn't in a terminal state.
 *
 * Trigger rule (issue #84, "Trigger rule — precise definition"):
 *  - Fires ONLY on provider_id: NULL -> <a provider>
 *  - Does NOT fire on reassignment (provider A -> provider B)
 *  - Does NOT fire on an edit that never touches provider_id
 *  - Does NOT fire when the booking's status is 'cancelled' or 'done'
 */
export function shouldSendProviderAssignedEmail(
  transition: ProviderAssignmentTransition
): boolean {
  // Normalise "" to null: some call sites hand this function the raw form
  // field value, which uses "" (not null) as "nothing selected" so it can
  // be bound directly to a controlled <select>.
  const previous = transition.previousProviderId || null
  const next = transition.newProviderId || null

  // A provider was already set -> this is either a reassignment or an
  // edit that left provider_id untouched. Neither should notify.
  if (previous) return false

  // No provider is being assigned in this save -> nothing to notify.
  if (!next) return false

  // Terminal-status bookings never trigger a notification, even on
  // first assignment.
  if (transition.status === "cancelled" || transition.status === "done") {
    return false
  }

  return true
}
