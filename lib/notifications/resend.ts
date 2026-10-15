/**
 * lib/notifications/resend.ts
 *
 * Server-only integration with the Resend transactional email API
 * (issue #84 — a training exercise on calling a third-party API from
 * real, server-side app code).
 *
 * WHY a plain `fetch` call instead of `npm install resend`:
 * Resend's REST API is a single JSON POST endpoint
 * (https://api.resend.com/emails). Pulling in the `resend` npm package
 * would add a dependency for what is, functionally, one HTTP call —
 * and a plain `fetch` is trivial to mock in Vitest
 * (`vi.spyOn(global, "fetch")` or injecting a fetch-like function)
 * without needing to construct a whole SDK client instance. This also
 * keeps the lesson focused on "here is what a third-party API call
 * actually looks like under the hood", which is the whole point of the
 * exercise. If the integration grows later (templates, attachments,
 * webhooks, retries) it's worth revisiting the SDK — but not for this
 * scope.
 *
 * WHY this file must only ever run on the server:
 * process.env.RESEND_API_KEY is a secret. It is NOT prefixed with
 * NEXT_PUBLIC_, so Next.js already refuses to inline it into any
 * client bundle — but as a second line of defence, this module is only
 * ever imported from a Route Handler (app/api/.../route.ts), never
 * from a "use client" component like BookingForm.tsx.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails"

// Resend's shared sandbox sender. It can only deliver to the Resend
// account owner's own verified address — fine for the training demo,
// but a verified custom domain should replace this via RESEND_FROM_EMAIL
// once one exists (see .env.local.example).
const DEFAULT_FROM = "Book_it <onboarding@resend.dev>"

/** The pieces of a booking needed to write the notification email. */
export interface ProviderAssignedEmailContent {
  listingName: string
  /** Pre-formatted single-line address, or null if unavailable. */
  listingAddress: string | null
  checkIn: string // YYYY-MM-DD
  checkOut: string // YYYY-MM-DD
  /** Mission label(s) linked to the booking — can be empty (see issue edge cases). */
  missionLabels: string[]
  providerFee: number
}

export interface ProviderAssignedEmailPayload extends ProviderAssignedEmailContent {
  /** The assigned provider's email address (public.users.email). */
  to: string
}

/**
 * Builds the email subject + HTML body from booking details.
 * Pure function (no I/O) so the email CONTENT can be unit-tested without
 * mocking fetch or touching the network at all.
 */
export function buildProviderAssignedEmail(
  content: ProviderAssignedEmailContent
): { subject: string; html: string } {
  // Edge case (issue #84): a booking can exist with no mission linked —
  // show a French placeholder instead of an empty line.
  const missionText =
    content.missionLabels.length > 0
      ? content.missionLabels.join(", ")
      : "Aucune mission spécifiée"

  const subject = `Nouvelle mission — ${content.listingName}`

  const html = `
    <div style="font-family: sans-serif; color: #111111; line-height: 1.5;">
      <h2>Vous avez été assigné à une nouvelle mission</h2>
      <p><strong>Propriété :</strong> ${content.listingName}${
        content.listingAddress ? ` — ${content.listingAddress}` : ""
      }</p>
      <p><strong>Arrivée :</strong> ${content.checkIn}</p>
      <p><strong>Départ :</strong> ${content.checkOut}</p>
      <p><strong>Mission :</strong> ${missionText}</p>
      <p><strong>Frais prestataire :</strong> ${content.providerFee} €</p>
    </div>
  `.trim()

  return { subject, html }
}

/**
 * Sends the "you've been assigned a mission" email via Resend.
 *
 * THROWS on failure (missing key aside — see below). This is
 * intentional: the CALLER (the API route handler) is responsible for
 * catching the error and logging it server-side, per issue #84's
 * non-negotiable rule that a Resend failure must never surface to the
 * booking save flow. Keeping the throw here (rather than swallowing it
 * in this file) keeps this function's own tests simple — "did it throw
 * when Resend returned an error?" — and keeps the "catch and log"
 * responsibility in exactly one place.
 */
export async function sendProviderAssignedEmail(
  payload: ProviderAssignedEmailPayload
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    // No key configured yet (e.g. local dev, before Philippe sets up the
    // Resend account per the issue's Definition of Done). We don't throw
    // here — an unconfigured integration is an expected, non-error state
    // during development, not a failure worth bubbling up as one.
    console.error(
      "[resend] RESEND_API_KEY is not set — skipping provider-assigned email"
    )
    return
  }

  const { subject, html } = buildProviderAssignedEmail(payload)

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || DEFAULT_FROM,
      to: [payload.to],
      subject,
      html,
    }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => "")
    throw new Error(`Resend API responded with ${response.status}: ${text}`)
  }
}
