"use client"

/**
 * app/synthese/page.tsx
 *
 * Synthèse screen — Owner-only financial summary.
 *
 * WHY "use client":
 * - All four filters (year, month, listing, provider) are managed as React state.
 * - Filtering happens client-side after a single fetch (owners have < 200 bookings/year).
 * - We need supabase.auth.getUser() on the client to check the role and redirect providers.
 *
 * DATA STRATEGY:
 * - On mount: fetch ALL non-cancelled bookings in one shot (no year filter at query level).
 *   This lets us derive the year dropdown from real data AND switch years without a network
 *   round-trip. For the listing / provider dropdowns, we fetch those in parallel.
 * - All metric computation (totals, averages, percentages) happens on the derived dataset
 *   after filters are applied.
 *
 * LAYOUT:
 * - Mobile first: single column, full-width px-4.
 * - Desktop (lg:): max-w-screen-lg mx-auto — centred, readable on wide screens.
 *
 * SECTION INDEX (approximate line numbers):
 *   ~60   — LABELS constant (all French UI strings)
 *   ~95   — TypeScript interfaces (BookingRow, ListingOption, ProviderOption,
 *            ListingSummary, ProviderSummary)
 *   ~130  — Helpers (formatPrice, formatMonthLabel)
 *   ~155  — Main component + state
 *   ~230  — Data fetch effect (mount only)
 *   ~320  — Derived: filter options
 *   ~380  — Derived: filtered bookings
 *   ~400  — Derived: per-listing summaries
 *   ~420  — Derived: per-provider summaries
 *   ~450  — Derived: grandTotal, moyenneMensuelle, totalPresta
 *   ~470  — Loading state render
 *   ~485  — Main render: header, filters, empty states, report card
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { AppHeader } from "@/components/book-it/app-header"

// ---------------------------------------------------------------------------
// All user-facing strings — never hardcoded inline in JSX.
// Grouped here so future i18n extraction is a single-file operation.
// ---------------------------------------------------------------------------

const LABELS = {
  pageTitle:           "Synthèse",
  filterAllMonths:     "Tous les mois",
  filterAllListings:   "Toutes propriétés",
  filterAllProviders:  "Tous prestataires",
  /** "Total location 2026" shown in the properties total bar */
  totalLabel:          (year: string) => `Total location ${year}`,
  moyenneMensuelle:    "Moy. mensuelle",
  /** Header of the providers section in the report card */
  prestatairesSection: "Prestataires",
  /** Label in the providers total bar */
  totalPrestataires:   "Total prestataires",
  /** Empty state when owner has zero bookings at all */
  emptyNoBookings:     "Vous n'avez aucune réservation pour le moment.",
  /** Empty state when filters produce no results (but bookings exist) */
  emptyFiltered:       "Aucune réservation pour ces filtres.",
  resetFilters:        "Réinitialiser les filtres",
  loading:             "Chargement…",
} as const

// ---------------------------------------------------------------------------
// TypeScript interfaces
// ---------------------------------------------------------------------------

/**
 * A single booking row returned from the DB query.
 * We only select the fields we need for the Synthèse metrics.
 */
interface BookingRow {
  rental_price: number
  provider_fee: number
  check_in:     string    // YYYY-MM-DD
  listing_id:   string
  /** listing name, resolved via the inner join in the query */
  listing_name: string
  provider_id:  string | null
}

/** A single listing option for the dropdown. */
interface ListingOption {
  id:   string
  name: string
}

/** A single provider option for the dropdown. */
interface ProviderOption {
  id:         string
  /** Full name: first_name + last_name */
  full_name:  string
}

/** Per-listing aggregation — one row in the card list. */
interface ListingSummary {
  listing_id:   string
  listing_name: string
  /** SUM(rental_price) for this listing after filters */
  total:        number
}

/** Per-provider aggregation — one row in the provider section. */
interface ProviderSummary {
  provider_id:   string
  provider_name: string
  /** SUM(provider_fee) for non-cancelled bookings matching active filters */
  fee:           number
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
 * Format a "YYYY-MM" key as a human-readable French month label.
 * Example: "2026-05" → "Mai 2026"
 * We append "-01" to get a valid date, then format it.
 */
function formatMonthLabel(yearMonth: string): string {
  const d = new Date(`${yearMonth}-01T00:00:00`)
  return d
    .toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    // Capitalise first letter so "mai 2026" → "Mai 2026"
    .replace(/^./, (c) => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function SynthesePage() {
  const router = useRouter()

  // Keep a stable Supabase client reference — avoids creating a new client on
  // every render (createClient() is cheap, but ref is good practice).
  const supabaseRef = useRef(createClient())
  const supabase    = supabaseRef.current

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  /** All non-cancelled bookings fetched on mount. Never re-fetched. */
  const [bookings, setBookings]             = useState<BookingRow[]>([])
  /** Listing options for the dropdown — fetched from owner_listing. */
  const [listingOptions, setListingOptions] = useState<ListingOption[]>([])
  /** Provider options for the dropdown — fetched from owner_provider. */
  const [providerOptions, setProviderOptions] = useState<ProviderOption[]>([])
  /** Avatar letter for the shared AppHeader. */
  const [avatarLetter, setAvatarLetter]     = useState("?")
  /** True while the initial data fetch is in flight. */
  const [isLoading, setIsLoading]           = useState(true)

  // Filter state — year defaults to the current calendar year
  const currentYear = String(new Date().getFullYear())
  const [filterYear,     setFilterYear]     = useState(currentYear)
  const [filterMonth,    setFilterMonth]    = useState("")
  const [filterListing,  setFilterListing]  = useState("")
  const [filterProvider, setFilterProvider] = useState("")

  /**
   * handleYearChange — update year and reset month.
   * WHY reset month: the selected month may not exist in the new year, which
   * would leave the dropdown showing a stale value that matches nothing.
   */
  function handleYearChange(year: string) {
    setFilterYear(year)
    setFilterMonth("")
  }

  /**
   * resetFilters — restore all filters to their default "show everything" state.
   * Called from the empty-state CTA.
   */
  const resetFilters = useCallback(() => {
    setFilterYear(currentYear)
    setFilterMonth("")
    setFilterListing("")
    setFilterProvider("")
  }, [currentYear])

  // -------------------------------------------------------------------------
  // EFFECT: verify session, check role, fetch data on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    async function init() {
      // Step 1: verify the user is authenticated
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

      // Step 4: run all three fetches in parallel (no dependency between them)
      const [bookingsResult, listingsResult, providersResult] = await Promise.all([
        // ---- Bookings ----
        // Fetch ALL non-cancelled bookings with no year filter at the query level.
        // WHY: we derive the year dropdown from this dataset and want year-switching
        // to be instant (no re-fetch). With < 200 bookings/year typical usage, the
        // full dataset is small enough to hold in memory.
        supabase
          .from("bookings")
          .select("rental_price, provider_fee, check_in, listing_id, provider_id, listings!inner(name)")
          .neq("status", "cancelled"),

        // ---- Listings dropdown ----
        // owner_listing is scoped by RLS to the authenticated owner, so this
        // automatically returns only their properties.
        // BUG-008 note: we query owner_listing joined to listings directly —
        // this is the owner path, not a provider path, so RLS allows it.
        supabase
          .from("owner_listing")
          .select("listing_id, listings!inner(id, name)"),

        // ---- Providers dropdown ----
        // owner_provider is scoped by RLS to the authenticated owner.
        // We fetch the user profile for each linked provider.
        supabase
          .from("owner_provider")
          .select("provider_id, users!provider_id(id, first_name, last_name)"),
      ])

      // Map bookings to our internal shape
      if (bookingsResult.data) {
        const mapped: BookingRow[] = bookingsResult.data.map((r: Record<string, unknown>) => {
          // PostgREST returns the joined listing as an object or array
          const listing = Array.isArray(r.listings) ? r.listings[0] : r.listings as Record<string, string>
          return {
            rental_price: r.rental_price as number,
            provider_fee: r.provider_fee as number,
            check_in:     r.check_in    as string,
            listing_id:   r.listing_id  as string,
            listing_name: (listing as Record<string, string>)?.name ?? "—",
            provider_id:  (r.provider_id as string | null) ?? null,
          }
        })
        setBookings(mapped)
      }

      // Map listing options
      if (listingsResult.data) {
        const options: ListingOption[] = listingsResult.data
          .map((r: Record<string, unknown>) => {
            // listings join returns object or array
            const l = Array.isArray(r.listings) ? r.listings[0] : r.listings as Record<string, string>
            return {
              id:   (l as Record<string, string>)?.id   ?? "",
              name: (l as Record<string, string>)?.name ?? "",
            }
          })
          // Remove any rows where the join returned null (shouldn't happen but guard anyway)
          .filter((o) => o.id)
          // Sort A→Z
          .sort((a, b) => a.name.localeCompare(b.name, "fr"))
        setListingOptions(options)
      }

      // Map provider options
      if (providersResult.data) {
        const options: ProviderOption[] = providersResult.data
          .map((r: Record<string, unknown>) => {
            // users join via foreign key — returns object or array
            const u = Array.isArray(r.users) ? r.users[0] : r.users as Record<string, string>
            const firstName = (u as Record<string, string>)?.first_name ?? ""
            const lastName  = (u as Record<string, string>)?.last_name  ?? ""
            return {
              id:        (u as Record<string, string>)?.id ?? (r.provider_id as string),
              full_name: `${firstName} ${lastName}`.trim() || "—",
            }
          })
          .filter((o) => o.id)
          .sort((a, b) => a.full_name.localeCompare(b.full_name, "fr"))
        setProviderOptions(options)
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
    // Only show months that have bookings in the selected year (or all years if no year filter)
    const keysSet = new Set(
      bookings
        .filter((b) => !filterYear || b.check_in.startsWith(filterYear))
        .map((b) => b.check_in.slice(0, 7)) // "YYYY-MM"
    )
    return Array.from(keysSet)
      .sort()
      .map((k) => ({ value: k, label: formatMonthLabel(k) }))
  }, [bookings, filterYear])

  // -------------------------------------------------------------------------
  // Derived: filtered bookings (AND logic across all four filters)
  // -------------------------------------------------------------------------

  const filteredBookings = useMemo(() => {
    return bookings.filter((b) => {
      // Year: check_in starts with "YYYY"
      if (filterYear     && !b.check_in.startsWith(filterYear))                  return false
      // Month: check_in starts with "YYYY-MM"
      if (filterMonth    && !b.check_in.startsWith(filterMonth))                 return false
      // Listing: filter by listing_id (not name — more reliable)
      if (filterListing  && b.listing_id !== filterListing)                       return false
      // Provider: filter by provider_id
      if (filterProvider && b.provider_id !== filterProvider)                     return false
      return true
    })
  }, [bookings, filterYear, filterMonth, filterListing, filterProvider])

  // -------------------------------------------------------------------------
  // Derived: per-listing summaries
  // -------------------------------------------------------------------------

  const listingSummaries = useMemo((): ListingSummary[] => {
    // Group by listing_id, accumulate rental_price totals
    const map = new Map<string, ListingSummary>()
    filteredBookings.forEach((b) => {
      const existing = map.get(b.listing_id)
      if (existing) {
        existing.total += b.rental_price
      } else {
        map.set(b.listing_id, {
          listing_id:   b.listing_id,
          listing_name: b.listing_name,
          total:        b.rental_price,
        })
      }
    })
    // Sort A→Z by listing name for a stable display order
    return Array.from(map.values()).sort((a, b) =>
      a.listing_name.localeCompare(b.listing_name, "fr")
    )
  }, [filteredBookings])

  // -------------------------------------------------------------------------
  // Derived: per-provider summaries
  // -------------------------------------------------------------------------

  /**
   * Per-provider fee totals.
   * All providers linked to the owner are shown, even those at 0 € in the period.
   * When filterProvider is active, only that provider's row is shown (not all at 0€).
   * WHY: spec requires exactly one row when a provider filter is active.
   */
  const providerSummaries = useMemo((): ProviderSummary[] => {
    const feeMap = new Map<string, number>()
    filteredBookings.forEach((b) => {
      if (!b.provider_id) return
      feeMap.set(b.provider_id, (feeMap.get(b.provider_id) ?? 0) + b.provider_fee)
    })

    // When a provider filter is active, only show that provider's row
    const visibleProviders = filterProvider
      ? providerOptions.filter((p) => p.id === filterProvider)
      : providerOptions

    return visibleProviders.map((p) => ({
      provider_id:   p.id,
      provider_name: p.full_name,
      fee:           feeMap.get(p.id) ?? 0,
    }))
  }, [filteredBookings, providerOptions, filterProvider])

  // -------------------------------------------------------------------------
  // Derived: grand total, monthly average, provider fees total
  // -------------------------------------------------------------------------

  const grandTotal = useMemo(
    () => listingSummaries.reduce((sum, l) => sum + l.total, 0),
    [listingSummaries]
  )

  /**
   * Moyenne mensuelle: grand_total ÷ 12.
   * WHY always divide by 12: the spec requires this to be a yearly average
   * regardless of the month filter. This makes it a stable KPI — if you filter
   * to a single month you can still see how that month's revenue compares to
   * the full-year average.
   */
  const moyenneMensuelle = useMemo(() => grandTotal / 12, [grandTotal])

  // totalPresta: SUM of all per-provider fees (replaces fraisPresta — same computation)
  const totalPresta = useMemo(
    () => providerSummaries.reduce((sum, p) => sum + p.fee, 0),
    [providerSummaries]
  )

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
      {/* Desktop: centred, max-width. Mobile: full-width px-4.              */}
      {/* ------------------------------------------------------------------ */}
      <main className="px-4 py-6 max-w-screen-lg mx-auto">

        {/* Page title */}
        <h1 className="text-lg font-semibold text-neutral-900 mb-4">
          {LABELS.pageTitle}
        </h1>

        {/* -------------------------------------------------------------- */}
        {/* Filter bar                                                       */}
        {/* Row 1: Year + Month                                              */}
        {/* Row 2: Listing + Provider                                        */}
        {/* Each select is h-11 for a comfortable 44px tap target on mobile. */}
        {/* -------------------------------------------------------------- */}
        <div className="flex flex-col gap-2 mb-4">

          {/* Row 1: Year + Month */}
          <div className="flex gap-2">
            {/* Year filter — options derived from real booking data */}
            <select
              value={filterYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              {/*
               * WHY no "Toutes les années" default option:
               * The spec says year defaults to current year. An "all years" option
               * was not requested. If the owner has no bookings in a given year,
               * that year simply won't appear in the dropdown.
               */}
              {yearOptions.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
              {/*
               * Guard: if there are no bookings at all, still show the current year
               * so the page has a valid default value.
               */}
              {yearOptions.length === 0 && (
                <option value={currentYear}>{currentYear}</option>
              )}
            </select>

            {/* Month filter — shows months present in the selected year */}
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

          {/* Row 2: Listing + Provider */}
          <div className="flex gap-2">
            {/* Listing filter */}
            <select
              value={filterListing}
              onChange={(e) => setFilterListing(e.target.value)}
              className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{LABELS.filterAllListings}</option>
              {listingOptions.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>

            {/* Provider filter */}
            <select
              value={filterProvider}
              onChange={(e) => setFilterProvider(e.target.value)}
              className="h-11 flex-1 rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">{LABELS.filterAllProviders}</option>
              {providerOptions.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* -------------------------------------------------------------- */}
        {/* Empty state — two distinct cases:                               */}
        {/*   1. Owner has zero bookings at all — no reset button needed    */}
        {/*   2. Filters produce no match — show reset button               */}
        {/* -------------------------------------------------------------- */}
        {bookings.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-neutral-500">{LABELS.emptyNoBookings}</p>
          </div>
        )}
        {bookings.length > 0 && filteredBookings.length === 0 && (
          <div className="text-center py-16 flex flex-col items-center gap-3">
            <p className="text-sm text-neutral-500">{LABELS.emptyFiltered}</p>
            <button
              onClick={resetFilters}
              className="text-sm text-primary underline underline-offset-2 hover:text-primary-dark"
            >
              {LABELS.resetFilters}
            </button>
          </div>
        )}

        {/* -------------------------------------------------------------- */}
        {/* Single report card                                              */}
        {/* Shown only when there is at least one matching booking.         */}
        {/* Contains: properties section, providers section, both totals.  */}
        {/* -------------------------------------------------------------- */}
        {filteredBookings.length > 0 && (
          <div className="rounded-xl border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden mt-2">

            {/* ── Properties section header ── */}
            <div className="px-4 pt-3 pb-1 bg-neutral-50 border-b border-neutral-100">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Propriétés</p>
            </div>

            {/* Per-listing rows — compact (py-2) with dividers */}
            <div className="divide-y divide-neutral-100">
              {listingSummaries.map((l) => {
                /**
                 * % of grand total: listing_total / grand_total × 100.
                 * Guard against division by zero — can happen when all rental prices are 0.
                 */
                const pct = grandTotal > 0 ? Math.round((l.total / grandTotal) * 100) : 0
                return (
                  <div key={l.listing_id} className="flex items-center justify-between px-4 py-2">
                    <div>
                      <p className="text-sm font-semibold text-neutral-900">{l.listing_name}</p>
                      <p className="text-xs text-neutral-400">{pct}%</p>
                    </div>
                    <p className="text-sm font-semibold text-neutral-900">{formatPrice(l.total)}</p>
                  </div>
                )
              })}
            </div>

            {/* Properties total bar */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary-light border-y border-primary/20">
              <span className="text-sm font-semibold text-neutral-900">{LABELS.totalLabel(filterYear || currentYear)}</span>
              <div className="text-right">
                <p className="text-base font-semibold text-primary">{formatPrice(grandTotal)}</p>
                <p className="text-xs text-neutral-500">{LABELS.moyenneMensuelle} {formatPrice(moyenneMensuelle)}/mois</p>
              </div>
            </div>

            {/* ── Providers section header ── */}
            <div className="px-4 pt-3 pb-1 bg-neutral-50 border-b border-neutral-100">
              <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{LABELS.prestatairesSection}</p>
            </div>

            {/* Per-provider rows */}
            <div className="divide-y divide-neutral-100">
              {providerSummaries.map((p) => (
                <div key={p.provider_id} className="flex items-center justify-between px-4 py-2">
                  <span className="text-sm text-neutral-900">{p.provider_name}</span>
                  <span className={p.fee === 0 ? "text-sm font-semibold text-neutral-400" : "text-sm font-semibold text-neutral-900"}>
                    {formatPrice(p.fee)}
                  </span>
                </div>
              ))}
            </div>

            {/* Providers total bar — same visual weight as properties total */}
            <div className="flex items-center justify-between px-4 py-3 bg-primary-light border-t border-primary/20">
              <span className="text-sm font-semibold text-neutral-900">{LABELS.totalPrestataires}</span>
              <span className="text-base font-semibold text-primary">{formatPrice(totalPresta)}</span>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
