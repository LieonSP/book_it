"use client"

/**
 * app/extraction/page.tsx
 *
 * Extraction screen — Owner-only CSV export of bookings.
 *
 * WHY "use client":
 * - Auth check and role guard require supabase.auth.getUser() on the client.
 * - Filter state (year, month) is React state — changes without network round-trips.
 * - CSV generation happens entirely client-side (Blob API — no server needed).
 *
 * DATA STRATEGY:
 * - On mount: fetch ALL non-cancelled bookings in one shot (same pattern as Synthèse).
 * - Missions are fetched separately (PostgREST limitation with many-to-many junctions).
 * - Filtering is done client-side after mount.
 *
 * LAYOUT:
 * - Mobile first: single column, full-width px-4.
 * - Desktop (lg:): max-w-screen-lg mx-auto — centred, readable on wide screens.
 * - Sticky footer: always visible — main has pb-28 to avoid content being hidden behind it.
 *
 * SECTION INDEX (approximate line numbers):
 *   ~60   — LABELS constant (all French UI strings)
 *   ~110  — TypeScript interfaces (BookingRow, MissionRow)
 *   ~145  — Helpers (formatPrice, formatDate, nbNuits, escapeCsv)
 *   ~185  — Main component + state
 *   ~250  — Data fetch effect (mount only)
 *   ~340  — Derived: year/month options, filteredBookings, stats
 *   ~410  — handleDownload: CSV generation
 *   ~480  — Loading state render
 *   ~495  — Main render: header, filters, preview, stats, sticky footer
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle2, Download } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AppHeader } from "@/components/book-it/app-header"
import { Button } from "@/components/book-it/button"
import { StatusBadge } from "@/components/book-it/status-badge"

// ---------------------------------------------------------------------------
// All user-facing strings — never hardcoded inline in JSX.
// Grouped here so future i18n extraction is a single-file operation.
// ---------------------------------------------------------------------------

const LABELS = {
  pageTitle:         "Extraction",
  filterAllMonths:   "Tous les mois",
  /** Aperçu section heading with count */
  apercu:            (count: number) => `Aperçu — ${count} réservation(s)`,
  /** "+N autres" footer inside the preview list */
  autresReservations: (n: number) => `+ ${n} autres réservation(s)`,
  /** Stats row labels */
  statReservations:  "Réservations",
  statTotalCA:       "Total CA",
  statFrais:         "Frais",
  /** Empty state when filters produce no results */
  emptyPeriode:      "Aucune réservation pour cette période.",
  /** Sticky footer filename label */
  fichierLabel:      "Fichier :",
  /** Download button */
  downloadBtn:       "Télécharger le CSV",
  /** Status badge labels (used inside the preview list) */
  statusPending:     "En attente",
  statusConfirmed:   "Confirmé",
  statusDone:        "Terminé",
  /** Loading state */
  loading:           "Chargement…",
  /** Nuits unit */
  nuits:             "nuits",
} as const

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

/** A single booking row returned from the DB query. */
interface BookingRow {
  id:                 string
  check_in:           string    // YYYY-MM-DD
  check_out:          string    // YYYY-MM-DD
  source:             string | null
  nb_pax:             number | null
  rental_price:       number
  provider_fee:       number
  status:             "pending" | "confirmed" | "done"
  note:               string | null
  listing_name:       string
  provider_name:      string
  tenant_first_name:  string | null
  tenant_last_name:   string | null
  tenant_phone:       string | null
  tenant_email:       string | null
}

/** A single row from the missions junction query. */
interface MissionRow {
  booking_id: string
  label:      string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a numeric amount as a French currency string.
 * Example: 1234.5 → "1 234,50 €"
 */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style:    "currency",
    currency: "EUR",
  }).format(amount)
}

/**
 * Format a YYYY-MM-DD date string as DD/MM/YYYY (French locale).
 * We append 'T00:00:00' to force local-time parsing (avoid UTC off-by-one).
 */
function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR")
}

/**
 * Compute the number of nights between check_in and check_out.
 * We force local midnight to avoid DST / UTC timezone issues.
 */
function nbNuits(checkIn: string, checkOut: string): number {
  const d1 = new Date(checkIn  + "T00:00:00").getTime()
  const d2 = new Date(checkOut + "T00:00:00").getTime()
  return Math.round((d2 - d1) / 86_400_000)
}

/**
 * Wrap a CSV cell value in double-quotes and escape any internal double-quotes
 * by doubling them. This handles commas and newlines inside note/name fields.
 * Example: She said "hello" → "She said ""hello"""
 */
function escapeCsv(value: string | null | undefined): string {
  const str = value ?? ""
  return '"' + str.replace(/"/g, '""') + '"'
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ExtractionPage() {
  const router = useRouter()

  // Keep a stable Supabase client reference — avoids creating a new one per render.
  const supabaseRef = useRef(createClient())
  const supabase    = supabaseRef.current

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** All non-cancelled bookings fetched on mount. Never re-fetched. */
  const [bookings, setBookings]               = useState<BookingRow[]>([])
  /**
   * Map from booking_id → comma-joined mission label string.
   * Built client-side from the second query (missions junction).
   */
  const [missionsMap, setMissionsMap]         = useState<Record<string, string>>({})
  /** Avatar letter for the shared AppHeader. */
  const [avatarLetter, setAvatarLetter]       = useState("?")
  /** True while the initial data fetch is in flight. */
  const [isLoading, setIsLoading]             = useState(true)

  // Filter state — year defaults to the current calendar year
  const currentYear = String(new Date().getFullYear())
  const [filterYear,  setFilterYear]  = useState(currentYear)
  const [filterMonth, setFilterMonth] = useState("")

  /**
   * handleYearChange — update year and reset month.
   * WHY reset month: the selected month may not exist in the new year, which
   * would leave the dropdown showing a stale value that matches nothing.
   */
  function handleYearChange(year: string) {
    setFilterYear(year)
    setFilterMonth("")
  }

  // -------------------------------------------------------------------------
  // EFFECT: verify session, check role, fetch data on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      // Step 1: verify the user is authenticated (same pattern as synthese/page.tsx)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/login")
        return
      }

      // Step 2: fetch the user's role from public.users
      const { data: profile } = await supabase
        .from("users")
        .select("type, first_name")
        .eq("id", user.id)
        .single()

      if (!profile) {
        router.replace("/login")
        return
      }

      // Step 3: redirect providers — this screen is owner-only
      if (profile.type === "provider") {
        router.replace("/dashboard")
        return
      }

      // BUG-004: use || not ?? — empty string falls back to "?"
      setAvatarLetter(profile.first_name?.charAt(0).toUpperCase() || "?")

      // Step 4: run both fetches in parallel
      const [bookingsResult, missionsResult] = await Promise.all([
        // ---- Bookings ----
        // Fetch ALL non-cancelled bookings with joins to listings, users (provider),
        // and tenants. RLS on bookings automatically scopes to the owner's listings.
        // We exclude 'cancelled' at query level so CSV never includes them.
        supabase
          .from("bookings")
          .select(`
            id,
            check_in,
            check_out,
            source,
            nb_pax,
            rental_price,
            provider_fee,
            status,
            note,
            listings!inner(name),
            users!provider_id(first_name, last_name),
            tenants!inner(first_name, last_name, phone, email)
          `)
          .neq("status", "cancelled")
          .order("check_in", { ascending: true }),

        // ---- Missions junction ----
        // PostgREST cannot resolve many-to-many through a junction table in a single
        // nested embed when RLS is involved — so we fetch separately and merge client-side.
        supabase
          .from("booking_missions")
          .select("booking_id, missions!inner(label)"),
      ])

      // Map bookings to our internal shape
      if (bookingsResult.data) {
        const mapped: BookingRow[] = bookingsResult.data.map((r: Record<string, unknown>) => {
          // PostgREST returns joined objects as either an object or a single-element array
          const listing  = (Array.isArray(r.listings)  ? r.listings[0]  : r.listings)  as Record<string, string> | null
          const provider = (Array.isArray(r.users)     ? r.users[0]     : r.users)     as Record<string, string> | null
          const tenant   = (Array.isArray(r.tenants)   ? r.tenants[0]   : r.tenants)   as Record<string, string> | null

          const provFirst = provider?.first_name ?? ""
          const provLast  = provider?.last_name  ?? ""

          return {
            id:                 r.id                as string,
            check_in:           r.check_in          as string,
            check_out:          r.check_out         as string,
            source:             r.source            as string | null,
            nb_pax:             r.nb_pax            as number | null,
            rental_price:       r.rental_price      as number,
            provider_fee:       r.provider_fee      as number,
            status:             r.status            as "pending" | "confirmed" | "done",
            note:               r.note              as string | null,
            listing_name:       listing?.name       ?? "—",
            provider_name:      `${provFirst} ${provLast}`.trim() || "—",
            tenant_first_name:  tenant?.first_name  ?? null,
            tenant_last_name:   tenant?.last_name   ?? null,
            tenant_phone:       tenant?.phone       ?? null,
            tenant_email:       tenant?.email       ?? null,
          }
        })
        setBookings(mapped)
      }

      // Build missions map: booking_id → "Mission A, Mission B"
      if (missionsResult.data) {
        const map: Record<string, string[]> = {}
        missionsResult.data.forEach((row: Record<string, unknown>) => {
          const bookingId = row.booking_id as string
          // missions join returns object or array
          const mission = (Array.isArray(row.missions) ? row.missions[0] : row.missions) as Record<string, string> | null
          const label   = mission?.label ?? ""
          if (!label) return
          if (!map[bookingId]) map[bookingId] = []
          map[bookingId].push(label)
        })
        // Join multiple missions with ", "
        const flat: Record<string, string> = {}
        Object.entries(map).forEach(([id, labels]) => {
          flat[id] = labels.join(", ")
        })
        setMissionsMap(flat)
      }

      setIsLoading(false)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -------------------------------------------------------------------------
  // Derived: year options (from real booking data, descending)
  // -------------------------------------------------------------------------

  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(bookings.map((b) => b.check_in.slice(0, 4))))
    return years.sort().reverse()
  }, [bookings])

  // -------------------------------------------------------------------------
  // Derived: month options (scoped to selected year)
  // -------------------------------------------------------------------------

  const monthOptions = useMemo(() => {
    const keysSet = new Set(
      bookings
        .filter((b) => !filterYear || b.check_in.startsWith(filterYear))
        .map((b) => b.check_in.slice(0, 7)) // "YYYY-MM"
    )
    return Array.from(keysSet)
      .sort()
      .map((k) => {
        // Format "YYYY-MM" → "Mai 2026" (French long month label)
        const d = new Date(`${k}-01T00:00:00`)
        const label = d
          .toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          .replace(/^./, (c) => c.toUpperCase()) // capitalise first letter
        return { value: k, label }
      })
  }, [bookings, filterYear])

  // -------------------------------------------------------------------------
  // Derived: filtered bookings (AND logic: year + optional month)
  // -------------------------------------------------------------------------

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Year: check_in starts with "YYYY"
      if (filterYear  && !b.check_in.startsWith(filterYear))  return false
      // Month: check_in starts with "YYYY-MM"
      if (filterMonth && !b.check_in.startsWith(filterMonth)) return false
      return true
    })
  }, [bookings, filterYear, filterMonth])

  // -------------------------------------------------------------------------
  // Derived: stats for the stats row
  // -------------------------------------------------------------------------

  const totalCA   = useMemo(() => filteredBookings.reduce((s, b) => s + b.rental_price, 0), [filteredBookings])
  const totalFees = useMemo(() => filteredBookings.reduce((s, b) => s + b.provider_fee, 0), [filteredBookings])

  // -------------------------------------------------------------------------
  // Derived: filename based on active filters
  // -------------------------------------------------------------------------

  const filename = useMemo(() => {
    if (filterMonth) {
      // filterMonth is "YYYY-MM" — take the last 2 chars for the zero-padded month
      const mm = filterMonth.slice(-2)
      return `reservations_${filterYear}_${mm}.csv`
    }
    return `reservations_${filterYear}.csv`
  }, [filterYear, filterMonth])

  // -------------------------------------------------------------------------
  // Preview list: first 3 rows of filteredBookings
  // -------------------------------------------------------------------------

  const first3 = filteredBookings.slice(0, 3)
  const count  = filteredBookings.length

  // -------------------------------------------------------------------------
  // Status helpers — map DB status to StatusBadge variant and French label
  // -------------------------------------------------------------------------

  /**
   * DB status → StatusBadge variant.
   * "done" maps to "neutral" (grey) because no specific semantic colour was defined for it.
   */
  const STATUS_VARIANT: Record<"pending" | "confirmed" | "done", "pending" | "confirmed" | "neutral"> = {
    pending:   "pending",
    confirmed: "confirmed",
    done:      "neutral",
  }

  /** DB status → French label for StatusBadge text */
  const STATUS_LABEL: Record<"pending" | "confirmed" | "done", string> = {
    pending:   LABELS.statusPending,
    confirmed: LABELS.statusConfirmed,
    done:      LABELS.statusDone,
  }

  // -------------------------------------------------------------------------
  // handleDownload — build the CSV and trigger a browser download
  // -------------------------------------------------------------------------

  /**
   * Build a CSV from filteredBookings and trigger a file download.
   *
   * Steps:
   * 1. Build the header row with French column labels.
   * 2. Map each booking to a CSV row (format dates, map labels, escape values).
   * 3. Prepend a UTF-8 BOM (\uFEFF) so Excel opens the file correctly on Windows.
   * 4. Create a Blob → object URL → invisible <a> click → revoke URL.
   */
  function handleDownload() {
    // CSV header — French labels in the specified order
    const header = [
      "Propriété",
      "Prestataire",
      "Locataire Prénom",
      "Locataire Nom",
      "Téléphone",
      "Email",
      "Arrivée",
      "Départ",
      "Nb nuits",
      "Source",
      "Mission",
      "Prix location (€)",
      "Frais prestataire (€)",
      "Statut",
      "Note",
    ].map(escapeCsv).join(",")

    // Source mapping: DB value → display label
    const SOURCE_LABEL: Record<string, string> = {
      airbnb: "Airbnb",
      direct: "Direct",
    }

    // Status mapping: DB value → French display label (for CSV, not the badge)
    const STATUS_CSV: Record<string, string> = {
      pending:   "En attente",
      confirmed: "Confirmé",
      done:      "Terminé",
    }

    // Build data rows
    const rows = filteredBookings.map((b) => {
      const nuits   = nbNuits(b.check_in, b.check_out)
      const source  = SOURCE_LABEL[b.source ?? ""] ?? (b.source ?? "")
      const status  = STATUS_CSV[b.status] ?? b.status
      const mission = missionsMap[b.id] ?? ""

      return [
        b.listing_name,
        b.provider_name,
        b.tenant_first_name ?? "",
        b.tenant_last_name  ?? "",
        b.tenant_phone      ?? "",
        b.tenant_email      ?? "",
        formatDate(b.check_in),
        formatDate(b.check_out),
        String(nuits),
        source,
        mission,
        String(b.rental_price),
        String(b.provider_fee),
        status,
        b.note ?? "",
      ].map(escapeCsv).join(",")
    })

    // Combine header + rows, prefixed with UTF-8 BOM for Excel compatibility
    const csv = "\uFEFF" + [header, ...rows].join("\n")

    // Create a Blob and trigger the browser download
    const blob = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }))
    const a    = document.createElement("a")
    a.href     = blob
    a.download = filename
    a.click()
    URL.revokeObjectURL(blob)
  }

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-sm text-neutral-500">{LABELS.loading}</p>
      </div>
    )
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* ------------------------------------------------------------------ */}
      {/* Header — shared AppHeader (logo click → /dashboard).               */}
      {/* ------------------------------------------------------------------ */}
      <AppHeader avatarLetter={avatarLetter} />

      {/* ------------------------------------------------------------------ */}
      {/* Main content                                                         */}
      {/* pb-28: ensures content is not hidden behind the sticky footer.      */}
      {/* Desktop: centred at 1024px+. Mobile: full-width px-4.              */}
      {/* ------------------------------------------------------------------ */}
      <main className="px-4 py-6 pb-28 max-w-screen-lg mx-auto">

        {/* Page title */}
        <h1 className="text-lg font-semibold text-neutral-900 mb-4">
          {LABELS.pageTitle}
        </h1>

        {/* -------------------------------------------------------------- */}
        {/* Filter row: Year + Month                                        */}
        {/* -------------------------------------------------------------- */}
        <div className="flex gap-2 mb-6">

          {/* Year filter — derived from real booking data */}
          <select
            value={filterYear}
            onChange={(e) => handleYearChange(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
            {/*
             * Guard: if owner has no non-cancelled bookings at all, the yearOptions
             * array is empty. Render the current year as a fallback so the select
             * is never empty and filterYear has a valid default.
             */}
            {yearOptions.length === 0 && (
              <option value={currentYear}>{currentYear}</option>
            )}
          </select>

          {/* Month filter — scoped to selected year, defaults to "all months" */}
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{LABELS.filterAllMonths}</option>
            {monthOptions.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Aperçu section — only shown when there are matching bookings    */}
        {/* -------------------------------------------------------------- */}
        {filteredBookings.length > 0 && (
          <>
            <div className="mb-4">
              {/* Section label with count */}
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
                {LABELS.apercu(count)}
              </p>

              {/* Preview card — first 3 bookings + optional overflow row */}
              <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] divide-y divide-neutral-100 overflow-hidden">
                {first3.map((b) => {
                  const tenantName  = [b.tenant_first_name, b.tenant_last_name].filter(Boolean).join(" ") || "—"
                  const nuits       = nbNuits(b.check_in, b.check_out)
                  const arrivee     = formatDate(b.check_in)
                  const depart      = formatDate(b.check_out)

                  return (
                    <div key={b.id} className="px-4 py-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-semibold text-neutral-900">{b.listing_name}</p>
                          <p className="text-xs text-neutral-500">{tenantName} · {nuits} {LABELS.nuits}</p>
                          <p className="text-xs text-neutral-400">{arrivee} → {depart}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-neutral-900">{b.rental_price} €</p>
                          <StatusBadge variant={STATUS_VARIANT[b.status]}>
                            {STATUS_LABEL[b.status]}
                          </StatusBadge>
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* "+N autres" row — shown only when there are more than 3 bookings */}
                {count > 3 && (
                  <div className="px-4 py-2 bg-neutral-50">
                    <p className="text-xs text-neutral-400 text-center">
                      {LABELS.autresReservations(count - 3)}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* ---------------------------------------------------------- */}
            {/* Stats row — 3 cells: count, total CA, provider fees         */}
            {/* ---------------------------------------------------------- */}
            <div className="grid grid-cols-3 gap-2">
              <StatCell label={LABELS.statReservations} value={String(count)} />
              <StatCell label={LABELS.statTotalCA}      value={formatPrice(totalCA)} />
              <StatCell label={LABELS.statFrais}        value={formatPrice(totalFees)} />
            </div>
          </>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Empty state — shown when filtered result is empty               */}
        {/* -------------------------------------------------------------- */}
        {filteredBookings.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-neutral-500">{LABELS.emptyPeriode}</p>
          </div>
        )}

      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Sticky footer — always visible over the main content.              */}
      {/* Contains: filename preview + download CTA button.                  */}
      {/* fixed bottom-0 with border-t creates a clear visual boundary.      */}
      {/* ------------------------------------------------------------------ */}
      <div className="fixed bottom-0 left-0 right-0 border-t border-neutral-200 bg-white px-4 py-3">
        {/* Filename row — lets the user see the exact file they'll get */}
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
          <p className="text-xs text-neutral-500">
            {LABELS.fichierLabel}{" "}
            <span className="font-semibold text-neutral-900">{filename}</span>
          </p>
        </div>

        {/* Download button — disabled when no bookings match the current filters */}
        <Button
          onClick={handleDownload}
          disabled={filteredBookings.length === 0}
          className="w-full"
        >
          <Download className="h-4 w-4" />
          {LABELS.downloadBtn}
        </Button>
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// StatCell — inline helper component (no separate file needed)
// ---------------------------------------------------------------------------

/**
 * StatCell — a small card showing a metric label and value.
 * Used in the stats row below the preview list.
 * Defined inline here (not a separate file) because it's only used on this page.
 */
function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5 text-center">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="text-base font-semibold text-neutral-900">{value}</p>
    </div>
  )
}
