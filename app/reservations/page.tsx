"use client"

/**
 * app/reservations/page.tsx
 *
 * Réservations list page — accessible by both owner and provider roles.
 *
 * WHY "use client":
 * - Reads sessionStorage on mount for toast messages set by BookingForm after
 *   a successful create/edit redirect.
 * - Reads URL search params (?error=not_found) for redirect-with-error signals
 *   from the edit page server component.
 * - Manages filter state (listing, month) client-side.
 *
 * DATA FLOW:
 * - Fetches all bookings visible to the authenticated user on mount.
 * - RLS on `bookings` automatically scopes the data:
 *     Owner  → all bookings on their listings
 *     Provider → only bookings assigned to them
 * - Filtering (listing, month) is applied client-side on the fetched data.
 *
 * LAYOUT:
 * - Owner:    bookings grouped by property name, with section totals.
 * - Provider: flat list, no grouping.
 *
 * NEXT.JS NOTE:
 * `useSearchParams()` must be wrapped in a <Suspense> boundary when used
 * in a client component that is the page itself. We isolate it in
 * <SearchParamsReader> below which is rendered inside <Suspense>.
 *
 * SECTION INDEX (approximate line numbers):
 *   ~90   — LABELS constant
 *   ~140  — TypeScript interfaces
 *   ~170  — Component + state initialisation
 *   ~240  — Data fetch effect
 *   ~320  — Toast / error effect (via SearchParamsReader)
 *   ~360  — Derived: filter options + filtered data
 *   ~430  — Helpers (status badge variant, date formatters)
 *   ~470  — SearchParamsReader component
 *   ~510  — Render — header
 *   ~550  — Render — filter bar
 *   ~600  — Render — owner grouped list
 *   ~700  — Render — provider flat list
 *   ~780  — Render — empty states
 */

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Pencil, Plus } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { AppHeader } from "@/components/book-it/app-header"
import { Button } from "@/components/book-it/button"
import { StatusBadge } from "@/components/book-it/status-badge"

// ---------------------------------------------------------------------------
// All user-facing strings grouped here — never hardcoded inline in JSX.
// ---------------------------------------------------------------------------

const LABELS = {
  pageTitle:          "Réservations",
  newBookingButton:   "Nouvelle",

  // Filter bar
  filterAllListings:  "Toutes propriétés",
  filterAllYears:     "Toutes les années",
  filterAllMonths:    "Tous les mois",

  // Column headers (for desktop table view)
  colPropriete:       "Propriété",
  colLocataire:       "Locataire",
  colArrivee:         "Arrivée",
  colDepart:          "Départ",
  colPrestataire:     "Prestataire",
  colStatut:          "Statut",
  colPrixLocation:    "Prix location",
  colFrais:           "Frais prestataire",

  // Status labels
  statusPending:      "En attente",
  statusConfirmed:    "Confirmé",
  statusDone:         "Terminé",
  statusCancelled:    "Annulé",

  // Group summary
  bookingCount:       (n: number) => n === 1 ? "1 réservation" : `${n} réservations`,
  groupTotal:         (total: string) => `${total} €`,

  // Empty states
  emptyNoBookings:    "Aucune réservation pour le moment.",
  emptyNewLink:       "Créer une réservation",
  emptyFiltered:      "Aucune réservation ne correspond aux filtres sélectionnés.",
  emptyResetFilters:  "Réinitialiser les filtres",

  // Edit action
  editAction:         "Modifier",

  // Toast messages
  toastNotFound:      "Réservation introuvable",
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BookingStatus = "pending" | "confirmed" | "done" | "cancelled"

/** A single booking row returned from the DB query. */
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
  note:         string | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Map DB status value to StatusBadge variant + French label. */
const STATUS_LABELS: Record<BookingStatus, string> = {
  pending:   LABELS.statusPending,
  confirmed: LABELS.statusConfirmed,
  done:      LABELS.statusDone,
  cancelled: LABELS.statusCancelled,
}

const STATUS_VARIANT: Record<BookingStatus, "pending" | "confirmed" | "neutral" | "cancelled"> = {
  pending:   "pending",
  confirmed: "confirmed",
  done:      "neutral",
  cancelled: "cancelled",
}

/** Format a YYYY-MM-DD string as "01 juin 2026" (French locale). */
function formatDate(isoDate: string): string {
  if (!isoDate) return "—"
  const d = new Date(isoDate + "T00:00:00")
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })
}

/** Format a YYYY-MM-DD string as "Juin 2026" for the month picker options. */
function formatMonth(isoDate: string): string {
  if (!isoDate) return ""
  const d = new Date(isoDate + "T00:00:00")
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    // Capitalise first letter
    .replace(/^./, (c) => c.toUpperCase())
}

/** Extract "YYYY-MM" from a YYYY-MM-DD string for grouping. */
function monthKey(isoDate: string): string {
  return isoDate.slice(0, 7)
}

/** Format a numeric price as "1 234,00 €". */
function formatPrice(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style:    "currency",
    currency: "EUR",
  }).format(amount)
}

// ---------------------------------------------------------------------------
// Simple toast component (inline — no third-party lib)
// ---------------------------------------------------------------------------

function Toast({ message, type, onDismiss }: {
  message: string
  type: "success" | "error"
  onDismiss: () => void
}) {
  // Auto-dismiss after 4 seconds
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        // top-[60px] pushes the toast below the ~56px page header so it never overlaps the logo
        "fixed top-[60px] left-1/2 -translate-x-1/2 z-50",
        "flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium",
        "max-w-xs w-full animate-in fade-in slide-in-from-top-2",
        type === "success"
          ? "bg-success-light text-success border border-success"
          : "bg-error-light text-error border border-error",
      ].join(" ")}
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={onDismiss}
        className="text-current opacity-60 hover:opacity-100 transition-opacity ml-1"
        aria-label="Fermer"
      >
        ×
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// SearchParamsReader
//
// Isolated inner component that reads URL search params.
// WHY isolated: Next.js requires useSearchParams() to be in a component
// wrapped in <Suspense>. By extracting it here we can wrap just this piece
// without putting a Suspense boundary around the entire page.
// ---------------------------------------------------------------------------

function SearchParamsReader({
  onNotFound,
  onNavigate,
}: {
  onNotFound: () => void
  onNavigate: (path: string) => void
}) {
  const searchParams = useSearchParams()

  useEffect(() => {
    const errorParam = searchParams.get("error")
    if (errorParam === "not_found") {
      onNotFound()
      // Remove the param from the URL so it doesn't persist on refresh
      const url = new URL(window.location.href)
      url.searchParams.delete("error")
      onNavigate(url.pathname)
    }
    // We only want this to run once on mount — the callbacks are stable refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return null
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

export default function ReservationsPage() {
  const router = useRouter()

  const supabaseRef = useRef(createClient())
  const supabase    = supabaseRef.current

  // -----------------------------------------------------------------------
  // State
  // -----------------------------------------------------------------------

  const [bookings,    setBookings]    = useState<BookingRow[]>([])
  const [userRole,    setUserRole]    = useState<"owner" | "provider" | null>(null)
  const [avatarLetter, setAvatarLetter] = useState("?")
  const [isLoading,   setIsLoading]  = useState(true)

  // Filter state
  const [filterListing, setFilterListing] = useState("")
  // Year filter defaults to the current year — reduces noise when many years of data exist
  const currentYear = String(new Date().getFullYear())
  const [filterYear,    setFilterYear]    = useState(currentYear)
  const [filterMonth,   setFilterMonth]   = useState("")

  // Reset month when year changes — avoids a stale "YYYY-MM" combo like "2025-05" showing
  // in the month dropdown while the year is set to 2026.
  function handleYearChange(year: string) {
    setFilterYear(year)
    setFilterMonth("")
  }

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null)

  const dismissToast = useCallback(() => setToast(null), [])

  // -----------------------------------------------------------------------
  // EFFECT: verify session + fetch profile on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.replace("/login")
        return
      }

      const { data: profile } = await supabase
        .from("users")
        .select("type, first_name")
        .eq("id", user.id)
        .single()

      if (!profile) {
        router.replace("/login")
        return
      }

      // BUG-004: use || not ?? so empty string falls back to "?"
      setAvatarLetter(profile.first_name?.charAt(0).toUpperCase() || "?")
      setUserRole(profile.type as "owner" | "provider")

      // ---------------------------------------------------------------
      // Fetch bookings
      // RLS scopes the result automatically:
      //   Owner → all bookings on listings they manage
      //   Provider → only bookings assigned to them
      // ---------------------------------------------------------------
      const { data: rows } = await supabase
        .from("bookings")
        .select(`
          id,
          check_in,
          check_out,
          rental_price,
          provider_fee,
          status,
          note,
          listings!inner(name),
          users!provider_id(first_name, last_name),
          tenants!inner(first_name, last_name)
        `)
        // Default sort: listing name A→Z, then check_in ASC
        .order("check_in", { ascending: true })

      if (rows) {
        const mapped: BookingRow[] = rows.map((r: Record<string, unknown>) => {
          // PostgREST returns joined tables as objects (or arrays when ambiguous)
          const listing  = Array.isArray(r.listings)  ? r.listings[0]  : r.listings  as Record<string, string>
          const provider = Array.isArray(r.users)      ? r.users[0]      : r.users     as Record<string, string>
          const tenant   = Array.isArray(r.tenants)    ? r.tenants[0]    : r.tenants   as Record<string, string>

          const providerName = provider
            ? `${provider.first_name ?? ""} ${provider.last_name ?? ""}`.trim()
            : "—"

          return {
            id:           r.id as string,
            check_in:     r.check_in as string,
            check_out:    r.check_out as string,
            rental_price: r.rental_price as number,
            provider_fee: r.provider_fee as number,
            status:       r.status as BookingStatus,
            listing_name: (listing as Record<string, string>)?.name ?? "—",
            provider_name: providerName,
            tenant_name:  tenant
              ? `${(tenant as Record<string, string>).first_name ?? ""} ${(tenant as Record<string, string>).last_name ?? ""}`.trim()
              : "—",
            note:         (r.note as string | null) ?? null,
          }
        })

        // Sort: listing name A→Z first, then check_in ASC
        mapped.sort((a, b) => {
          const listingCmp = a.listing_name.localeCompare(b.listing_name, "fr")
          if (listingCmp !== 0) return listingCmp
          return a.check_in.localeCompare(b.check_in)
        })

        setBookings(mapped)
      }

      setIsLoading(false)
    }

    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // EFFECT: show toast from sessionStorage (set by BookingForm after redirect)
  // This effect only reads sessionStorage — not URL params (see SearchParamsReader below).
  // -----------------------------------------------------------------------

  useEffect(() => {
    // Read success toast (set by BookingForm on successful create/edit)
    const successMsg = sessionStorage.getItem("booking_toast")
    if (successMsg) {
      sessionStorage.removeItem("booking_toast")
      setToast({ message: successMsg, type: "success" })
    }
  }, [])

  // -----------------------------------------------------------------------
  // Derived: distinct listing names for filter dropdown
  // -----------------------------------------------------------------------

  const listingOptions = useMemo(() => {
    const names = Array.from(new Set(bookings.map((b) => b.listing_name))).sort((a, b) =>
      a.localeCompare(b, "fr")
    )
    return names
  }, [bookings])

  // -----------------------------------------------------------------------
  // Derived: distinct months (formatted) for filter dropdown
  // -----------------------------------------------------------------------

  // Distinct years derived from bookings data (descending — most recent first)
  const yearOptions = useMemo(() => {
    const years = Array.from(new Set(bookings.map((b) => b.check_in.slice(0, 4))))
    return years.sort().reverse()
  }, [bookings])

  const monthOptions = useMemo(() => {
    // Collect distinct YYYY-MM keys, optionally scoped to the selected year
    const keysSet = new Set(
      bookings
        .filter((b) => !filterYear || b.check_in.startsWith(filterYear))
        .map((b) => monthKey(b.check_in))
    )
    const keys = Array.from(keysSet).sort()
    return keys.map((k) => ({
      value: k,
      label: formatMonth(k + "-01"),
    }))
  }, [bookings, filterYear])

  // -----------------------------------------------------------------------
  // Derived: filtered bookings
  // -----------------------------------------------------------------------

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Year filter: check_in starts with "YYYY" (e.g. "2026-05-10".startsWith("2026"))
      if (filterYear    && !b.check_in.startsWith(filterYear))    return false
      if (filterListing && b.listing_name !== filterListing)       return false
      if (filterMonth   && monthKey(b.check_in) !== filterMonth)   return false
      return true
    })
  }, [bookings, filterListing, filterMonth, filterYear])

  // -----------------------------------------------------------------------
  // Derived: bookings grouped by listing_name (owner view)
  // -----------------------------------------------------------------------

  const groupedByListing = useMemo(() => {
    const map = new Map<string, BookingRow[]>()
    filteredBookings.forEach((b) => {
      const group = map.get(b.listing_name) ?? []
      group.push(b)
      map.set(b.listing_name, group)
    })
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, "fr"))
  }, [filteredBookings])

  // -----------------------------------------------------------------------
  // Loading skeleton
  // -----------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <p className="text-sm text-neutral-500">Chargement…</p>
      </div>
    )
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-neutral-50">

      {/*
       * SearchParamsReader is wrapped in Suspense because Next.js requires
       * useSearchParams() to be in a component that is inside a Suspense
       * boundary when the parent is a client component used as the page root.
       * The fallback is null — reading params is instant, the boundary is just
       * for the build-time static analysis requirement.
       */}
      <Suspense fallback={null}>
        <SearchParamsReader
          onNotFound={() => setToast({ message: LABELS.toastNotFound, type: "error" })}
          onNavigate={(path) => router.replace(path)}
        />
      </Suspense>

      {/* Toast notification */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onDismiss={dismissToast} />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Header — shared AppHeader (logo click → /dashboard).               */}
      {/* ------------------------------------------------------------------ */}
      <AppHeader avatarLetter={avatarLetter} />

      {/* ------------------------------------------------------------------ */}
      {/* Main                                                                */}
      {/* Desktop: max-w centred. Mobile: full-width px-4.                  */}
      {/* ------------------------------------------------------------------ */}
      <main className="px-4 py-6 max-w-screen-lg mx-auto">

        {/* Page title + CTA row */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-lg font-semibold text-neutral-900">
            {LABELS.pageTitle}
          </h1>
          <Link href="/reservations/nouvelle">
            <Button size="sm">
              <Plus className="h-4 w-4" />
              {LABELS.newBookingButton}
            </Button>
          </Link>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Filter bar                                                        */}
        {/* Row 1: Propriété (full width)                                     */}
        {/* Row 2: Année + Mois side by side                                  */}
        {/* ---------------------------------------------------------------- */}
        <div className="flex flex-col gap-2 mb-6">
          {/* Propriété filter — full width */}
          <select
            value={filterListing}
            onChange={(e) => setFilterListing(e.target.value)}
            className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="">{LABELS.filterAllListings}</option>
            {listingOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <div className="flex gap-2">
            {/* Année filter — defaults to current year, scopes the month dropdown */}
            <select
              value={filterYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{LABELS.filterAllYears}</option>
              {yearOptions.map((year) => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>

            {/* Mois filter — populated from months in the selected year */}
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="h-10 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{LABELS.filterAllMonths}</option>
              {monthOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* Content — depends on data + filter state                         */}
        {/* ---------------------------------------------------------------- */}

        {/* EMPTY STATE 1: no bookings at all */}
        {bookings.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <p className="text-sm text-neutral-500">{LABELS.emptyNoBookings}</p>
            <Link href="/reservations/nouvelle">
              <Button size="sm">
                <Plus className="h-4 w-4" />
                {LABELS.emptyNewLink}
              </Button>
            </Link>
          </div>
        )}

        {/* EMPTY STATE 2: filters active but no results */}
        {bookings.length > 0 && filteredBookings.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <p className="text-sm text-neutral-500">{LABELS.emptyFiltered}</p>
            <button
              onClick={() => { setFilterListing(""); setFilterYear(currentYear); setFilterMonth("") }}
              className="text-sm text-primary underline underline-offset-2 hover:text-primary-dark"
            >
              {LABELS.emptyResetFilters}
            </button>
          </div>
        )}

        {/* OWNER VIEW — grouped by property */}
        {userRole === "owner" && filteredBookings.length > 0 && (
          <div className="flex flex-col gap-6">
            {groupedByListing.map(([listingName, rows]) => {
              const total = rows.reduce((sum, b) => sum + b.rental_price, 0)
              return (
                <section key={listingName}>
                  {/* Property group header */}
                  <div className="flex items-center justify-between mb-2 px-1">
                    <div className="flex items-baseline gap-2">
                      <h2 className="text-sm font-semibold text-neutral-900">{listingName}</h2>
                      <span className="text-xs text-neutral-500">
                        {LABELS.bookingCount(rows.length)}
                      </span>
                    </div>
                    <span className="text-xs font-semibold text-neutral-700">
                      {formatPrice(total)}
                    </span>
                  </div>

                  {/* Booking rows for this property */}
                  <div className="rounded-lg border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
                    {rows.map((b, idx) => (
                      <BookingListRow
                        key={b.id}
                        booking={b}
                        showListingName={false}
                        isLast={idx === rows.length - 1}
                      />
                    ))}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {/* PROVIDER VIEW — flat list, no grouping */}
        {userRole === "provider" && filteredBookings.length > 0 && (
          <div className="rounded-lg border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
            {filteredBookings.map((b, idx) => (
              <BookingListRow
                key={b.id}
                booking={b}
                showListingName={true}
                isLast={idx === filteredBookings.length - 1}
              />
            ))}
          </div>
        )}

      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// BookingListRow — a single booking item in the list
// ---------------------------------------------------------------------------

/**
 * Renders one booking row. On mobile: stacked card-like layout.
 * On desktop (md:): horizontal row with all columns visible.
 */
function BookingListRow({
  booking,
  showListingName,
  isLast,
}: {
  booking:         BookingRow
  showListingName: boolean
  isLast:          boolean
}) {
  return (
    <div
      className={[
        "px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:gap-4",
        !isLast ? "border-b border-neutral-100" : "",
      ].join(" ")}
    >
      {/* Left: tenant + listing (if shown) + dates + provider + note */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Top line: tenant name + status badge */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-neutral-900 truncate">
            {booking.tenant_name}
          </span>
          {/* StatusBadge — uses French labels + colour coding */}
          <StatusBadge variant={STATUS_VARIANT[booking.status]}>
            {STATUS_LABELS[booking.status]}
          </StatusBadge>
        </div>

        {/* Property name — shown in provider flat list */}
        {showListingName && (
          <span className="text-xs text-neutral-500 truncate">{booking.listing_name}</span>
        )}

        {/* Dates */}
        <span className="text-xs text-neutral-500">
          {formatDate(booking.check_in)} → {formatDate(booking.check_out)}
        </span>

        {/* Provider name */}
        <span className="text-xs text-neutral-400">{booking.provider_name}</span>

        {/* Note — shown when present; useful for providers preparing the property */}
        {booking.note && (
          <span className="text-xs text-neutral-500 italic line-clamp-2 mt-0.5">
            {booking.note}
          </span>
        )}
      </div>

      {/* Right: prices + edit — always right-aligned (justify-end on all sizes) */}
      <div className="flex items-center gap-3 justify-end flex-shrink-0">
        {/* Prices */}
        <div className="flex flex-col gap-0.5 text-right">
          <span className="text-sm font-semibold text-neutral-900">
            {formatPrice(booking.rental_price)}
          </span>
          <span className="text-xs text-neutral-500">
            {LABELS.colFrais}: {formatPrice(booking.provider_fee)}
          </span>
        </div>

        {/* Edit icon — blue by default so it's clearly actionable */}
        <Link
          href={`/reservations/${booking.id}/modifier`}
          className="h-8 w-8 flex items-center justify-center rounded-lg border border-primary text-primary hover:bg-primary hover:text-white transition-colors"
          aria-label={LABELS.editAction}
        >
          <Pencil className="h-4 w-4" />
        </Link>
      </div>
    </div>
  )
}
