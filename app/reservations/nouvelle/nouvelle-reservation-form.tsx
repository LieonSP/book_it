"use client"

/**
 * app/reservations/nouvelle/nouvelle-reservation-form.tsx
 *
 * The "Nouvelle réservation" form — a Client Component.
 *
 * WHY "use client":
 * This component manages a large amount of form state (controlled inputs,
 * validation errors, loading flags, auto-fill logic) and reacts to user
 * interactions. All of that requires the React hooks that only work on the
 * client side.
 *
 * Props are passed from the Server Component wrapper (page.tsx), which fetches
 * the user's role and identity server-side to avoid an extra client round-trip.
 *
 * Layout: 3 section-cards separated by connector lines on a scrollable page,
 * with a sticky footer containing Cancel + Submit buttons.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Lock } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/book-it/button"
import { InputField } from "@/components/book-it/input-field"
import { LogoutButton } from "@/components/book-it/logout-button"

// ---------------------------------------------------------------------------
// All user-facing strings in a single LABELS object — never inline in JSX.
// WHY: makes future i18n extraction a one-step find-and-replace on this object.
// ---------------------------------------------------------------------------

const LABELS = {
  // Page
  pageTitle: "Nouvelle réservation",

  // Section headers
  section1Title: "Réservation",
  section2Title: "Locataire",
  section3Title: "Mission & Tarifs",

  // Section 1 — Réservation
  propriete: "Propriété",
  proprieteRequired: "Ce champ est obligatoire",
  proprieteEmptyOwner: "Aucune propriété. Ajoutez-en une depuis le menu Propriétés.",
  proprieteEmptyProvider: "Aucune propriété disponible. Contactez votre propriétaire.",
  proprieteSelect: "Sélectionner une propriété",

  prestataire: "Prestataire",
  prestataireOptional: "(optionnel)",
  prestataireRequired: "Ce champ est obligatoire",
  prestataireEmptyOwner: "Aucun prestataire lié. Ajoutez-en un depuis le menu Prestataires.",
  prestataireSelect: "Sélectionner un prestataire",
  prestataireProviderHelper: "Vous ne pouvez créer des réservations qu'en votre nom",

  source: "Source",
  sourceAirbnb: "Airbnb",
  sourceDirect: "Direct",
  sourceRequired: "Ce champ est obligatoire",

  arrivee: "Arrivée",
  arriveeRequired: "Ce champ est obligatoire",
  depart: "Départ",
  departRequired: "Ce champ est obligatoire",
  departAfterArrivee: "La date de départ doit être après la date d'arrivée",

  heureArrivee: "Heure arrivée",
  heureDepart: "Heure départ",

  nbVoyageurs: "Nb. voyageurs",
  nbVoyageursRequired: "Ce champ est obligatoire",
  nbVoyageursMin: "Le nombre de voyageurs doit être d'au moins 1",

  // Section 2 — Locataire
  prenom: "Prénom",
  prenomRequired: "Ce champ est obligatoire",
  nom: "Nom",
  nomRequired: "Ce champ est obligatoire",
  telephone: "Téléphone",
  email: "Email",

  // Section 3 — Mission & Tarifs
  mission: "Mission",
  missionOptional: "(optionnel)",
  missionRequired: "Ce champ est obligatoire",
  missionSelect: "Sélectionner une mission",
  missionHelper: "Suggestion basée sur la relation propriétaire/prestataire",
  missionEmptyOwner: "Aucune mission définie. Ajoutez-en une depuis les paramètres.",
  missionEmptyProvider: "Aucune mission disponible pour ce propriétaire.",

  prixLocation: "Prix location (€)",
  prixLocationRequired: "Ce champ est obligatoire",
  prixLocationMin: "Le prix doit être supérieur à 0",

  fraisPrestataire: "Frais prestataire (€)",
  fraisPrestataireRequired: "Ce champ est obligatoire",
  fraisAutoLabel: "Auto",

  note: "Note",

  // Footer buttons
  annuler: "Annuler",
  creer: "Créer la réservation",

  // Generic error shown when the INSERT fails unexpectedly
  submitError: "Une erreur est survenue. Veuillez réessayer.",
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Props {
  /** The authenticated user's UUID — auth.uid() on the server */
  userId: string
  /** The authenticated user's role */
  userRole: "owner" | "provider"
  /** Used to display the avatar letter in the header */
  firstName: string
}

/** A listing option rendered in the <select> */
interface ListingOption {
  id: string
  name: string
}

/** A provider option rendered in the <select> */
interface ProviderOption {
  id: string
  firstName: string
  lastName: string
}

/** A mission option rendered in the <select> */
interface MissionOption {
  id: string
  label: string
  ownerId: string
}

/** A provider_pricing row with its linked mission IDs */
interface PricingRow {
  id: string
  fee: number
  provider_pricing_missions: { mission_id: string }[]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NouvelleReservationForm({ userId, userRole, firstName }: Props) {
  const router = useRouter()

  // The first letter of the user's first name for the header avatar
  // BUG-004: use || not ?? so empty string also falls back to "?"
  const avatarLetter = firstName?.charAt(0).toUpperCase() || "?"

  // ------------------------------------------------------------------
  // Supabase browser client — created once, stable across re-renders
  // ------------------------------------------------------------------
  // We use a ref so the client instance is never recreated on re-render.
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // ------------------------------------------------------------------
  // Data fetched on mount
  // ------------------------------------------------------------------

  const [listings, setListings]   = useState<ListingOption[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [missions, setMissions]   = useState<MissionOption[]>([])

  // ------------------------------------------------------------------
  // Form field state — Section 1
  // ------------------------------------------------------------------

  const [listingId, setListingId]         = useState("")
  const [providerId, setProviderId]       = useState("")
  const [source, setSource]               = useState<"airbnb" | "direct">("airbnb")
  const [checkIn, setCheckIn]             = useState("")
  const [checkOut, setCheckOut]           = useState("")
  const [checkInTime, setCheckInTime]     = useState("")
  const [checkOutTime, setCheckOutTime]   = useState("")
  const [nbPax, setNbPax]                 = useState("")

  // ------------------------------------------------------------------
  // Form field state — Section 2
  // ------------------------------------------------------------------

  const [tenantFirstName, setTenantFirstName] = useState("")
  const [tenantLastName, setTenantLastName]   = useState("")
  const [tenantPhone, setTenantPhone]         = useState("")
  const [tenantEmail, setTenantEmail]         = useState("")

  // ------------------------------------------------------------------
  // Form field state — Section 3
  // ------------------------------------------------------------------

  const [missionId, setMissionId]           = useState("")
  const [rentalPrice, setRentalPrice]       = useState("")
  const [providerFee, setProviderFee]       = useState("")
  const [note, setNote]                     = useState("")

  // Tracks whether the provider_fee was auto-filled from provider_pricing
  const [isFeeAuto, setIsFeeAuto]           = useState(false)

  // ------------------------------------------------------------------
  // Validation errors — keyed by field name
  // ------------------------------------------------------------------

  const [errors, setErrors] = useState<Record<string, string>>({})

  // ------------------------------------------------------------------
  // Submission state
  // ------------------------------------------------------------------

  const [isSubmitting, setIsSubmitting]   = useState(false)
  const [submitError, setSubmitError]     = useState<string | null>(null)

  // ------------------------------------------------------------------
  // Derived: the owner_id we need for tenant INSERT and pricing queries.
  //
  // - Owner role: owner_id = their own userId
  // - Provider role: owner_id = owner of the selected listing
  //   (fetched asynchronously when listingId changes)
  // ------------------------------------------------------------------

  const [ownerIdContext, setOwnerIdContext] = useState<string | null>(
    // Owners know their owner_id immediately; providers must wait for listingId
    userRole === "owner" ? userId : null
  )

  // ------------------------------------------------------------------
  // EFFECT: fetch listings on mount (depends on role)
  // ------------------------------------------------------------------

  useEffect(() => {
    async function fetchListings() {
      if (userRole === "owner") {
        // Owners: fetch listings they manage via owner_listing junction
        const { data } = await supabase
          .from("owner_listing")
          .select("listing_id, listings(id, name)")
          .eq("owner_id", userId)

        if (data) {
          const opts = data
            .map((row) => {
              // The foreign key join may return an array or a single object
              const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings
              if (!listing) return null
              return { id: listing.id, name: listing.name }
            })
            .filter((x): x is ListingOption => x !== null)
          setListings(opts)
          // Pre-select the first listing if there is exactly one
          if (opts.length === 1) setListingId(opts[0].id)
        }
      } else {
        // Provider: fetch listings of owners they work for
        // owner_provider gives us the owner_ids → owner_listing gives us listing_ids
        const { data } = await supabase
          .from("owner_provider")
          .select("owner_id, owner_listing(listing_id, listings(id, name))")
          .eq("provider_id", userId)

        if (data) {
          const opts: ListingOption[] = []
          data.forEach((opRow) => {
            const olRows = Array.isArray(opRow.owner_listing) ? opRow.owner_listing : []
            olRows.forEach((olRow) => {
              const listing = Array.isArray(olRow.listings) ? olRow.listings[0] : olRow.listings
              if (listing && !opts.find((o) => o.id === listing.id)) {
                opts.push({ id: listing.id, name: listing.name })
              }
            })
          })
          setListings(opts)
          if (opts.length === 1) setListingId(opts[0].id)
        }
      }
    }

    fetchListings()
    // Only run once on mount — userId and userRole are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------------
  // EFFECT: for providers, resolve the owner_id from the selected listing
  // ------------------------------------------------------------------

  useEffect(() => {
    if (userRole !== "provider" || !listingId) {
      // Owners always know their owner_id; providers need a selected listing
      if (userRole !== "provider") return
      setOwnerIdContext(null)
      return
    }

    async function resolveOwner() {
      // owner_listing links a listing to its owner — we need the owner_id
      // for inserting tenants and querying provider_pricing
      const { data } = await supabase
        .from("owner_listing")
        .select("owner_id")
        .eq("listing_id", listingId)
        .limit(1)
        .single()

      setOwnerIdContext(data?.owner_id ?? null)
    }

    resolveOwner()
  }, [listingId, userRole, supabase])

  // ------------------------------------------------------------------
  // EFFECT: fetch providers when ownerIdContext is known (owner role only)
  // ------------------------------------------------------------------

  useEffect(() => {
    if (userRole !== "owner") {
      // Providers are pre-filled as themselves — no need to fetch a list
      setProviders([{ id: userId, firstName, lastName: "" }])
      setProviderId(userId)
      return
    }

    async function fetchProviders() {
      // Owners: fetch providers they manage via owner_provider junction.
      // WHY "users!provider_id": owner_provider has two FKs to users (owner_id
      // and provider_id). Without a hint, PostgREST cannot resolve the join and
      // returns null, leaving the provider list empty. The hint tells PostgREST
      // to follow provider_id → users, not owner_id → users.
      const { data } = await supabase
        .from("owner_provider")
        .select("provider_id, users!provider_id(id, first_name, last_name)")
        .eq("owner_id", userId)

      if (data) {
        const opts = data
          .map((row) => {
            const u = Array.isArray(row.users) ? row.users[0] : row.users
            if (!u) return null
            return { id: u.id, firstName: u.first_name, lastName: u.last_name }
          })
          .filter((x): x is ProviderOption => x !== null)
        setProviders(opts)
        if (opts.length === 1) setProviderId(opts[0].id)
      }
    }

    fetchProviders()
    // Only run once on mount for owners
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ------------------------------------------------------------------
  // EFFECT: fetch missions when ownerIdContext is known
  // ------------------------------------------------------------------

  useEffect(() => {
    if (!ownerIdContext) {
      // Can't fetch missions without knowing the owner
      setMissions([])
      setMissionId("")
      return
    }

    async function fetchMissions() {
      // Missions are scoped to an owner — fetch all for this owner_id
      const { data } = await supabase
        .from("missions")
        .select("id, label, owner_id, created_at")
        .eq("owner_id", ownerIdContext!)
        .order("created_at", { ascending: true })

      if (data && data.length > 0) {
        const opts = data.map((m) => ({ id: m.id, label: m.label, ownerId: m.owner_id }))
        setMissions(opts)
        // Default: earliest-created mission (already sorted ASC by created_at)
        setMissionId(opts[0].id)
      } else {
        setMissions([])
        setMissionId("")
      }
    }

    fetchMissions()
  }, [ownerIdContext, supabase])

  // ------------------------------------------------------------------
  // Auto-fill provider_fee when provider + mission + ownerIdContext change
  // ------------------------------------------------------------------

  const runAutoFill = useCallback(async (
    currentProviderId: string,
    currentMissionId: string,
    currentOwnerIdContext: string | null
  ) => {
    // All three values are needed to query provider_pricing
    if (!currentProviderId || !currentMissionId || !currentOwnerIdContext) {
      setIsFeeAuto(false)
      return
    }

    // Query provider_pricing rows for this owner+provider combo
    const { data: pricingRows } = await supabase
      .from("provider_pricing")
      .select("id, fee, provider_pricing_missions(mission_id)")
      .eq("owner_id", currentOwnerIdContext)
      .eq("provider_id", currentProviderId)

    if (!pricingRows) {
      setIsFeeAuto(false)
      return
    }

    // Find a pricing row whose linked missions include the selected mission
    const match = (pricingRows as PricingRow[]).find((p) =>
      p.provider_pricing_missions.some((m) => m.mission_id === currentMissionId)
    )

    if (match) {
      // Auto-fill: set the fee and mark it as auto-filled
      setProviderFee(String(match.fee))
      setIsFeeAuto(true)
    } else {
      // No match — clear auto-fill state but do not clear a manually entered value
      setIsFeeAuto(false)
    }
  }, [supabase])

  // Run auto-fill whenever the relevant fields change
  useEffect(() => {
    runAutoFill(providerId, missionId, ownerIdContext)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, missionId, ownerIdContext])

  // ------------------------------------------------------------------
  // Validation
  // ------------------------------------------------------------------

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    // Required field checks
    if (!listingId)       newErrors.listingId       = LABELS.proprieteRequired
    // Provider is required for providers (pre-filled as themselves) but optional for owners.
    // WHY: an owner may want to record a booking before assigning a provider.
    if (userRole !== "owner" && !providerId) newErrors.providerId = LABELS.prestataireRequired
    if (!source)          newErrors.source          = LABELS.sourceRequired
    if (!checkIn)         newErrors.checkIn         = LABELS.arriveeRequired
    if (!checkOut)        newErrors.checkOut        = LABELS.departRequired
    if (!nbPax)           newErrors.nbPax           = LABELS.nbVoyageursRequired
    if (!tenantFirstName) newErrors.tenantFirstName = LABELS.prenomRequired
    if (!tenantLastName)  newErrors.tenantLastName  = LABELS.nomRequired
    // Mission is optional for owners — a booking can exist without a mission assigned yet.
    // For providers, mission remains required (they know what task they are performing).
    if (userRole !== "owner" && !missionId) newErrors.missionId = LABELS.missionRequired
    if (!rentalPrice)     newErrors.rentalPrice     = LABELS.prixLocationRequired

    // Date logic: check_out must be strictly after check_in
    if (checkIn && checkOut && checkOut <= checkIn) {
      newErrors.checkOut = LABELS.departAfterArrivee
    }

    // Rental price must be > 0
    if (rentalPrice && parseFloat(rentalPrice) <= 0) {
      newErrors.rentalPrice = LABELS.prixLocationMin
    }

    // nb_pax must be >= 1
    if (nbPax && parseInt(nbPax, 10) < 1) {
      newErrors.nbPax = LABELS.nbVoyageursMin
    }

    setErrors(newErrors)
    // Returns true if there are no validation errors
    return Object.keys(newErrors).length === 0
  }

  // ------------------------------------------------------------------
  // Submit handler — 3-step atomic INSERT with rollback on failure
  // ------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    // Run frontend validation first — bail out if anything fails
    if (!validate()) return

    setIsSubmitting(true)

    try {
      // ----------------------------------------------------------------
      // Step 1 — Derive owner_id for the tenant INSERT
      // ----------------------------------------------------------------
      // Owners insert tenants they own directly (owner_id = their userId).
      // Providers insert tenants for the listing's owner (ownerIdContext).
      const tenantOwnerId = userRole === "owner" ? userId : ownerIdContext

      if (!tenantOwnerId) {
        // This should not happen after validation, but guard defensively
        setSubmitError(LABELS.submitError)
        return
      }

      // ----------------------------------------------------------------
      // Step 2 — INSERT tenant
      // ----------------------------------------------------------------
      const { data: tenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          owner_id:   tenantOwnerId,
          first_name: tenantFirstName.trim(),
          last_name:  tenantLastName.trim(),
          phone:      tenantPhone.trim() || null,
          email:      tenantEmail.trim() || null,
        })
        .select("id")
        .single()

      if (tenantError || !tenant) {
        setSubmitError(LABELS.submitError)
        return
      }

      // ----------------------------------------------------------------
      // Step 3 — INSERT booking
      // ----------------------------------------------------------------
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .insert({
          listing_id:     listingId,
          // Convert empty string to null — provider is optional for owners.
          // The column is a UUID: sending "" would cause a Postgres type error.
          provider_id:    providerId || null,
          tenant_id:      tenant.id,
          pricing_id:     null,  // not used in this form — fee is entered manually
          check_in:       checkIn,
          check_in_time:  checkInTime || null,
          check_out:      checkOut,
          check_out_time: checkOutTime || null,
          source:         source,
          nb_pax:         parseInt(nbPax, 10),
          rental_price:   parseFloat(rentalPrice),
          currency:       "EUR",
          provider_fee:   providerFee !== "" ? parseFloat(providerFee) : 0,
          status:         "pending",
          note:           note.trim() || null,
        })
        .select("id")
        .single()

      if (bookingError || !booking) {
        // Rollback: delete the orphaned tenant we just created.
        // Uses a SECURITY DEFINER RPC (BUG-011) because the tenant's
        // owner_id is the listing owner's uid, not the provider's uid —
        // a direct .delete() would be silently blocked by RLS for providers.
        await supabase.rpc("delete_orphaned_tenant", { p_tenant_id: tenant.id })
        setSubmitError(LABELS.submitError)
        return
      }

      // ----------------------------------------------------------------
      // Step 4 — INSERT booking_missions (skipped if no mission selected)
      // WHY: mission is optional for owners, so missionId may be empty.
      // The bookings table has no direct mission column — missions live in
      // the booking_missions junction table and can simply be omitted.
      // ----------------------------------------------------------------
      if (missionId) {
        const { error: missionError } = await supabase
          .from("booking_missions")
          .insert({
            booking_id: booking.id,
            mission_id: missionId,
          })

        if (missionError) {
          // Rollback: delete booking (booking_missions CASCADE on booking delete)
          // then delete the orphaned tenant.
          // Uses a SECURITY DEFINER RPC for tenant delete (BUG-011) — see comment
          // above. Booking delete is fine via direct .delete() because bookings_delete
          // RLS allows the row's assigned provider to delete their own booking.
          await supabase.from("bookings").delete().eq("id", booking.id)
          await supabase.rpc("delete_orphaned_tenant", { p_tenant_id: tenant.id })
          setSubmitError(LABELS.submitError)
          return
        }
      }

      // ----------------------------------------------------------------
      // Success — navigate to the reservations list
      // ----------------------------------------------------------------
      router.push("/reservations")
    } finally {
      // Always clear the loading state, even if an error was thrown
      setIsSubmitting(false)
    }
  }

  // ------------------------------------------------------------------
  // Helpers: empty-state flags
  // ------------------------------------------------------------------

  const hasNoListings   = listings.length === 0
  const hasNoProviders  = userRole === "owner" && providers.length === 0
  // Submit is blocked only when there are no listings to choose from.
  // Having no providers does NOT block submit — provider is optional for owners.
  const isSubmitBlocked = hasNoListings

  // ------------------------------------------------------------------
  // Shared select class — applied to every native <select>
  // ------------------------------------------------------------------

  const selectCls = (fieldKey: string) =>
    [
      "h-11 w-full rounded-lg border bg-white px-3 text-sm leading-[1.5] text-neutral-900",
      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 focus:border-primary",
      "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-50",
      errors[fieldKey] ? "border-error" : "border-neutral-200",
    ].join(" ")

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* ---------------------------------------------------------------- */}
      {/* Header — same pattern as /dashboard and /reservations            */}
      {/* ---------------------------------------------------------------- */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <div className="flex items-center gap-2.5">
          <Image
            src="/logo-transparent.png"
            alt="Book_it"
            width={32}
            height={32}
            className="rounded-sm"
            priority
          />
          <p className="text-sm font-semibold text-neutral-900">
            Book<span className="text-primary">_it</span>
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
            <span className="text-xs font-semibold text-primary">{avatarLetter}</span>
          </div>
          <LogoutButton />
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* Main — scrollable form body                                      */}
      {/* pb-28 creates space above the fixed footer so content isn't hidden */}
      {/* ---------------------------------------------------------------- */}
      <main className="px-4 py-6 pb-28 max-w-lg mx-auto flex flex-col gap-1">

        {/* Page title */}
        <div className="px-1 pb-3">
          <h1 className="text-base font-semibold text-neutral-900">
            {LABELS.pageTitle}
          </h1>
        </div>

        {/* id links the sticky footer's submit button to this form element */}
        <form id="booking-form" onSubmit={handleSubmit} noValidate>

          {/* ============================================================ */}
          {/* SECTION 1 — Réservation                                      */}
          {/* ============================================================ */}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
            {/* Section header row */}
            <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
              <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-primary-foreground">1</span>
              </div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {LABELS.section1Title}
              </h2>
            </div>

            {/* Section fields */}
            <div className="px-4 py-4 flex flex-col gap-4">

              {/* ---- Propriété ---------------------------------------- */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-900">
                  {LABELS.propriete}
                </label>
                {hasNoListings ? (
                  <>
                    <select disabled className={selectCls("listingId")}>
                      <option>{LABELS.proprieteSelect}</option>
                    </select>
                    <p className="text-xs text-neutral-500">
                      {userRole === "owner"
                        ? LABELS.proprieteEmptyOwner
                        : LABELS.proprieteEmptyProvider}
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      value={listingId}
                      onChange={(e) => {
                        setListingId(e.target.value)
                        // Clear the listing-related error on change
                        setErrors((prev) => { const n = {...prev}; delete n.listingId; return n })
                      }}
                      className={selectCls("listingId")}
                    >
                      <option value="">{LABELS.proprieteSelect}</option>
                      {listings.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </select>
                    {errors.listingId && (
                      <p className="text-xs text-error">{errors.listingId}</p>
                    )}
                  </>
                )}
              </div>

              {/* ---- Prestataire --------------------------------------- */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-neutral-900">
                    {LABELS.prestataire}
                  </label>
                  {/* Show "(optionnel)" hint for owners — providers are always pre-filled */}
                  {userRole === "owner" && (
                    <span className="text-xs text-neutral-400">{LABELS.prestataireOptional}</span>
                  )}
                </div>
                {userRole === "provider" ? (
                  // Provider sees a disabled select pre-filled with their own name
                  <>
                    <div className="relative">
                      <select
                        disabled
                        value={userId}
                        className={selectCls("providerId") + " pr-10"}
                      >
                        <option value={userId}>
                          {firstName}
                        </option>
                      </select>
                      {/* Lock icon to visually signal the field is intentionally locked */}
                      <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                    </div>
                    <p className="text-xs text-neutral-500">
                      {LABELS.prestataireProviderHelper}
                    </p>
                  </>
                ) : hasNoProviders ? (
                  // Owner has no providers linked yet
                  <>
                    <select disabled className={selectCls("providerId")}>
                      <option>{LABELS.prestataireSelect}</option>
                    </select>
                    <p className="text-xs text-neutral-500">
                      {LABELS.prestataireEmptyOwner}
                    </p>
                  </>
                ) : (
                  // Owner selects from their provider list
                  <>
                    <select
                      value={providerId}
                      onChange={(e) => {
                        setProviderId(e.target.value)
                        setIsFeeAuto(false) // reset auto-fill when provider changes
                        setErrors((prev) => { const n = {...prev}; delete n.providerId; return n })
                      }}
                      className={selectCls("providerId")}
                    >
                      <option value="">{LABELS.prestataireSelect}</option>
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}
                        </option>
                      ))}
                    </select>
                    {errors.providerId && (
                      <p className="text-xs text-error">{errors.providerId}</p>
                    )}
                  </>
                )}
              </div>

              {/* ---- Source (segmented toggle) ------------------------- */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-900">
                  {LABELS.source}
                </label>
                {/*
                 * Segmented toggle: two equal halves inside a single rounded border.
                 * The selected half gets bg-primary text-primary-foreground;
                 * the unselected half stays white with muted text.
                 */}
                <div className="flex h-11 rounded-lg border border-neutral-200 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setSource("airbnb")}
                    className={[
                      "flex-1 text-sm font-semibold transition-colors",
                      source === "airbnb"
                        ? "bg-primary text-primary-foreground"
                        : "bg-white text-neutral-500 hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    {LABELS.sourceAirbnb}
                  </button>
                  {/* Thin divider between the two halves */}
                  <div className="w-px bg-neutral-200" />
                  <button
                    type="button"
                    onClick={() => setSource("direct")}
                    className={[
                      "flex-1 text-sm font-semibold transition-colors",
                      source === "direct"
                        ? "bg-primary text-primary-foreground"
                        : "bg-white text-neutral-500 hover:bg-neutral-50",
                    ].join(" ")}
                  >
                    {LABELS.sourceDirect}
                  </button>
                </div>
              </div>

              {/* ---- Dates — 2-column grid on all screen sizes ---------- */}
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label={LABELS.arrivee}
                  type="date"
                  value={checkIn}
                  onChange={(e) => {
                    setCheckIn(e.target.value)
                    setErrors((prev) => { const n = {...prev}; delete n.checkIn; delete n.checkOut; return n })
                  }}
                  error={errors.checkIn}
                />
                <InputField
                  label={LABELS.depart}
                  type="date"
                  value={checkOut}
                  onChange={(e) => {
                    setCheckOut(e.target.value)
                    setErrors((prev) => { const n = {...prev}; delete n.checkOut; return n })
                  }}
                  error={errors.checkOut}
                />
              </div>

              {/* ---- Times — 2-column grid ------------------------------ */}
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label={LABELS.heureArrivee}
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                />
                <InputField
                  label={LABELS.heureDepart}
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                />
              </div>

              {/* ---- Nombre de voyageurs ------------------------------- */}
              <InputField
                label={LABELS.nbVoyageurs}
                type="number"
                min={1}
                value={nbPax}
                onChange={(e) => {
                  setNbPax(e.target.value)
                  setErrors((prev) => { const n = {...prev}; delete n.nbPax; return n })
                }}
                error={errors.nbPax}
              />

            </div>
          </div>

          {/* Connector line between Section 1 and Section 2 */}
          <div className="flex justify-center py-1">
            <div className="w-px h-4 bg-neutral-300" />
          </div>

          {/* ============================================================ */}
          {/* SECTION 2 — Locataire                                        */}
          {/* ============================================================ */}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
              <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-primary-foreground">2</span>
              </div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {LABELS.section2Title}
              </h2>
            </div>

            <div className="px-4 py-4 flex flex-col gap-4">

              {/* Prénom + Nom — 2-column grid */}
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label={LABELS.prenom}
                  type="text"
                  value={tenantFirstName}
                  onChange={(e) => {
                    setTenantFirstName(e.target.value)
                    setErrors((prev) => { const n = {...prev}; delete n.tenantFirstName; return n })
                  }}
                  error={errors.tenantFirstName}
                />
                <InputField
                  label={LABELS.nom}
                  type="text"
                  value={tenantLastName}
                  onChange={(e) => {
                    setTenantLastName(e.target.value)
                    setErrors((prev) => { const n = {...prev}; delete n.tenantLastName; return n })
                  }}
                  error={errors.tenantLastName}
                />
              </div>

              {/* Téléphone — optional */}
              <InputField
                label={LABELS.telephone}
                type="tel"
                value={tenantPhone}
                onChange={(e) => setTenantPhone(e.target.value)}
              />

              {/* Email — optional */}
              <InputField
                label={LABELS.email}
                type="email"
                value={tenantEmail}
                onChange={(e) => setTenantEmail(e.target.value)}
              />

            </div>
          </div>

          {/* Connector line between Section 2 and Section 3 */}
          <div className="flex justify-center py-1">
            <div className="w-px h-4 bg-neutral-300" />
          </div>

          {/* ============================================================ */}
          {/* SECTION 3 — Mission & Tarifs                                 */}
          {/* ============================================================ */}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
              <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-primary-foreground">3</span>
              </div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {LABELS.section3Title}
              </h2>
            </div>

            <div className="px-4 py-4 flex flex-col gap-4">

              {/* ---- Mission ------------------------------------------ */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-neutral-900">
                    {LABELS.mission}
                  </label>
                  {/* Show "(optionnel)" hint for owners — mission is optional for them */}
                  {userRole === "owner" && (
                    <span className="text-xs text-neutral-400">{LABELS.missionOptional}</span>
                  )}
                </div>
                {missions.length === 0 ? (
                  <>
                    <select disabled className={selectCls("missionId")}>
                      <option>{LABELS.missionSelect}</option>
                    </select>
                    <p className="text-xs text-neutral-500">
                      {userRole === "owner"
                        ? LABELS.missionEmptyOwner
                        : LABELS.missionEmptyProvider}
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      value={missionId}
                      onChange={(e) => {
                        setMissionId(e.target.value)
                        setIsFeeAuto(false) // reset auto-fill when mission changes
                        setErrors((prev) => { const n = {...prev}; delete n.missionId; return n })
                      }}
                      className={selectCls("missionId")}
                    >
                      <option value="">{LABELS.missionSelect}</option>
                      {missions.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    {/* Helper text about the mission suggestion logic */}
                    {!errors.missionId && (
                      <p className="text-xs text-neutral-500">{LABELS.missionHelper}</p>
                    )}
                    {errors.missionId && (
                      <p className="text-xs text-error">{errors.missionId}</p>
                    )}
                  </>
                )}
              </div>

              {/* ---- Prix location ------------------------------------- */}
              <InputField
                label={LABELS.prixLocation}
                type="number"
                min={0}
                step="0.01"
                value={rentalPrice}
                onChange={(e) => {
                  setRentalPrice(e.target.value)
                  setErrors((prev) => { const n = {...prev}; delete n.rentalPrice; return n })
                }}
                error={errors.rentalPrice}
              />

              {/* ---- Frais prestataire — with optional "Auto" badge ------ */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-neutral-900">
                    {LABELS.fraisPrestataire}
                  </label>
                  {/*
                   * "Auto" badge: shown when provider_fee was auto-filled from
                   * provider_pricing. Removed as soon as the user manually edits
                   * the field. Uses CSS variable tokens — no hardcoded hex values.
                   */}
                  {isFeeAuto && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-light text-primary border border-primary">
                      {LABELS.fraisAutoLabel}
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={providerFee}
                  onChange={(e) => {
                    setProviderFee(e.target.value)
                    // Manual edit removes the auto badge
                    setIsFeeAuto(false)
                    setErrors((prev) => { const n = {...prev}; delete n.providerFee; return n })
                  }}
                  className={[
                    "h-11 w-full rounded-lg border px-3 text-sm leading-[1.5] text-neutral-900",
                    "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 focus:border-primary",
                    "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-50",
                    // Highlight the field when auto-filled
                    isFeeAuto
                      ? "bg-primary-light border-primary font-semibold text-primary"
                      : "bg-white border-neutral-200",
                    errors.providerFee ? "border-error" : "",
                  ].join(" ")}
                />
                {errors.providerFee && (
                  <p className="text-xs text-error">{errors.providerFee}</p>
                )}
              </div>

              {/* ---- Note — optional text input ------------------------- */}
              <InputField
                label={LABELS.note}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

            </div>
          </div>

          {/* Generic submit error shown when the INSERT fails unexpectedly */}
          {submitError && (
            <p className="text-sm text-error text-center pt-3" role="alert">
              {submitError}
            </p>
          )}

        </form>
      </main>

      {/* ---------------------------------------------------------------- */}
      {/* Sticky footer — Cancel + Submit                                  */}
      {/* md: constrains the footer to the max-w-lg column on larger screens */}
      {/* ---------------------------------------------------------------- */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-3 flex gap-3 md:max-w-lg md:mx-auto md:left-0 md:right-0">
        <Button
          type="button"
          variant="secondary"
          className="flex-1"
          onClick={() => router.push("/reservations")}
          disabled={isSubmitting}
        >
          {LABELS.annuler}
        </Button>
        <Button
          type="submit"
          form="booking-form"
          className="flex-1"
          isLoading={isSubmitting}
          disabled={isSubmitBlocked || isSubmitting}
        >
          {LABELS.creer}
        </Button>
      </div>

    </div>
  )
}
