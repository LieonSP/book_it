"use client"

/**
 * app/reservations/_components/BookingForm.tsx
 *
 * Single source of truth for the booking form — shared between create (#36)
 * and edit (#33) workflows. This avoids duplicated JSX and keeps field-level
 * permission logic in one place.
 *
 * WHY "use client":
 * The form manages a large amount of state (controlled inputs, validation,
 * async data fetches, auto-fill). All of that requires React hooks which only
 * run on the client side.
 *
 * MODES:
 * - mode="create": blank form, submits INSERT flow, no Statut field.
 * - mode="edit":   pre-filled from initialData, submits UPDATE flow,
 *                  shows Statut dropdown at the top.
 *
 * ROLE-BASED FIELD LOCKING:
 * - Providers cannot edit `provider_fee` or `provider_id`.
 * - This is enforced visually here AND at the DB level via a trigger
 *   (see migration 20260416000002_block_provider_fee_update.sql).
 *
 * SECTION INDEX (approximate line numbers):
 *   ~80   — LABELS constant (all French strings)
 *   ~160  — TypeScript interfaces (props, internal options)
 *   ~215  — Component function + state initialisation
 *   ~340  — Data-fetch effects (listings, providers, missions, auto-fill)
 *   ~530  — Validation function
 *   ~590  — Submit handler (create path)
 *   ~720  — Submit handler (edit path)
 *   ~850  — Render — Section 0 (Statut, edit only)
 *   ~890  — Render — Section 1 (Réservation)
 *   ~1060 — Render — Section 2 (Locataire)
 *   ~1120 — Render — Section 3 (Mission & Tarifs)
 *   ~1220 — Render — Sticky footer
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Lock } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/book-it/button"
import { InputField } from "@/components/book-it/input-field"
import { LogoutButton } from "@/components/book-it/logout-button"
import { StatusBadge } from "@/components/book-it/status-badge"

// ---------------------------------------------------------------------------
// All user-facing strings grouped here — never hardcoded inline in JSX.
// WHY: makes future i18n extraction a single find-and-replace on this object.
// ---------------------------------------------------------------------------

const LABELS = {
  // Page titles
  pageTitleCreate: "Nouvelle réservation",
  pageTitleEdit:   "Modifier la réservation",

  // Section headers
  section0Title: "Statut",
  section1Title: "Réservation",
  section2Title: "Locataire",
  section3Title: "Mission & Tarifs",

  // Status labels (DB enum → French UI label)
  statusPending:   "En attente",
  statusConfirmed: "Confirmé",
  statusDone:      "Terminé",
  statusCancelled: "Annulé",

  // Section 1 — Réservation
  propriete:            "Propriété",
  proprieteRequired:    "Ce champ est obligatoire",
  proprieteEmptyOwner:  "Aucune propriété. Ajoutez-en une depuis le menu Propriétés.",
  proprieteEmptyProvider: "Aucune propriété disponible. Contactez votre propriétaire.",
  proprieteSelect:      "Sélectionner une propriété",

  prestataire:            "Prestataire",
  prestataireOptional:    "(optionnel)",
  prestataireRequired:    "Ce champ est obligatoire",
  prestataireEmptyOwner:  "Aucun prestataire lié. Ajoutez-en un depuis le menu Prestataires.",
  prestataireSelect:      "Sélectionner un prestataire",
  prestataireProviderHelper: "Vous ne pouvez créer des réservations qu'en votre nom",

  source:         "Source",
  sourceAirbnb:   "Airbnb",
  sourceDirect:   "Direct",
  sourceRequired: "Ce champ est obligatoire",

  arrivee:             "Arrivée",
  arriveeRequired:     "Ce champ est obligatoire",
  depart:              "Départ",
  departRequired:      "Ce champ est obligatoire",
  departAfterArrivee:  "La date de départ doit être après la date d'arrivée",

  heureArrivee: "Heure arrivée",
  heureDepart:  "Heure départ",

  nbVoyageurs:        "Nb. voyageurs",
  nbVoyageursRequired: "Ce champ est obligatoire",
  nbVoyageursMin:      "Le nombre de voyageurs doit être d'au moins 1",

  // Section 2 — Locataire
  prenom:         "Prénom",
  prenomRequired: "Ce champ est obligatoire",
  nom:            "Nom",
  nomRequired:    "Ce champ est obligatoire",
  telephone:      "Téléphone",
  email:          "Email",

  // Section 3 — Mission & Tarifs
  mission:             "Mission",
  missionOptional:     "(optionnel)",
  missionRequired:     "Ce champ est obligatoire",
  missionSelect:       "Sélectionner une mission",
  missionHelper:       "Suggestion basée sur la relation propriétaire/prestataire",
  missionEmptyOwner:   "Aucune mission définie. Ajoutez-en une depuis les paramètres.",
  missionEmptyProvider: "Aucune mission disponible pour ce propriétaire.",

  prixLocation:        "Prix location (€)",
  prixLocationRequired: "Ce champ est obligatoire",
  prixLocationMin:     "Le prix doit être supérieur à 0",

  fraisPrestataire:    "Frais prestataire (€)",
  fraisAutoLabel:      "Auto",
  fraisLocked:         "Montant géré par le propriétaire",

  note: "Note",

  // Footer buttons
  annuler:      "Annuler",
  creer:        "Créer la réservation",
  enregistrer:  "Enregistrer",

  // Toast messages
  toastCreated: "Réservation créée",
  toastUpdated: "Réservation mise à jour",

  // Generic error shown when DB operation fails
  submitError: "Une erreur est survenue. Veuillez réessayer.",
} as const

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The booking status enum as stored in the database. */
type BookingStatus = "pending" | "confirmed" | "done" | "cancelled"

/** Booking source enum as stored in the database. */
type BookingSource = "airbnb" | "direct"

/**
 * Initial data shape for edit mode.
 * All fields mirror the bookings table, plus flattened tenant fields.
 */
export interface BookingInitialData {
  id: string
  listingId: string
  providerId: string
  providerName: string
  tenantId: string
  tenant: {
    firstName: string
    lastName:  string
    phone:     string | null
    email:     string | null
  }
  pricingId:     string | null
  checkIn:       string       // YYYY-MM-DD
  checkInTime:   string | null
  checkOut:      string       // YYYY-MM-DD
  checkOutTime:  string | null
  source:        BookingSource
  nbPax:         number
  rentalPrice:   number
  providerFee:   number
  status:        BookingStatus
  note:          string | null
  missionId:     string | null
}

/** Props accepted by BookingForm. */
export interface BookingFormProps {
  mode:        "create" | "edit"
  userId:      string
  userRole:    "owner" | "provider"
  firstName:   string
  initialData?: BookingInitialData
}

/** A listing option rendered in the <select>. */
interface ListingOption {
  id:   string
  name: string
}

/** A provider option rendered in the <select>. */
interface ProviderOption {
  id:        string
  firstName: string
  lastName:  string
}

/** A mission option rendered in the <select>. */
interface MissionOption {
  id:      string
  label:   string
  ownerId: string
}

/** A provider_pricing row with its linked mission IDs. */
interface PricingRow {
  id:   string
  fee:  number
  provider_pricing_missions: { mission_id: string }[]
}

// ---------------------------------------------------------------------------
// Helper: map DB status → French label
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending:   LABELS.statusPending,
  confirmed: LABELS.statusConfirmed,
  done:      LABELS.statusDone,
  cancelled: LABELS.statusCancelled,
}

// Map DB status → StatusBadge variant (used in the status dropdown preview)
const STATUS_BADGE_VARIANT: Record<BookingStatus, "pending" | "confirmed" | "neutral" | "cancelled"> = {
  pending:   "pending",
  confirmed: "confirmed",
  done:      "neutral",
  cancelled: "cancelled",
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BookingForm({
  mode,
  userId,
  userRole,
  firstName,
  initialData,
}: BookingFormProps) {
  const router = useRouter()

  // BUG-004: use || not ?? so empty string also falls back to "?"
  const avatarLetter = firstName?.charAt(0).toUpperCase() || "?"

  // Supabase browser client — created once, stable across re-renders
  const supabaseRef = useRef(createClient())
  const supabase = supabaseRef.current

  // -----------------------------------------------------------------------
  // Data fetched on mount
  // -----------------------------------------------------------------------

  const [listings,  setListings]  = useState<ListingOption[]>([])
  const [providers, setProviders] = useState<ProviderOption[]>([])
  const [missions,  setMissions]  = useState<MissionOption[]>([])

  // -----------------------------------------------------------------------
  // Form field state — Section 0 (edit mode only)
  // -----------------------------------------------------------------------

  const [status, setStatus] = useState<BookingStatus>(
    initialData?.status ?? "pending"
  )

  // -----------------------------------------------------------------------
  // Form field state — Section 1
  // -----------------------------------------------------------------------

  const [listingId,    setListingId]    = useState(initialData?.listingId  ?? "")
  const [providerId,   setProviderId]   = useState(initialData?.providerId ?? "")
  const [source,       setSource]       = useState<BookingSource>(initialData?.source ?? "airbnb")
  const [checkIn,      setCheckIn]      = useState(initialData?.checkIn    ?? "")
  const [checkOut,     setCheckOut]     = useState(initialData?.checkOut   ?? "")
  const [checkInTime,  setCheckInTime]  = useState(initialData?.checkInTime  ?? "")
  const [checkOutTime, setCheckOutTime] = useState(initialData?.checkOutTime ?? "")
  const [nbPax,        setNbPax]        = useState(
    initialData?.nbPax != null ? String(initialData.nbPax) : ""
  )

  // -----------------------------------------------------------------------
  // Form field state — Section 2
  // -----------------------------------------------------------------------

  const [tenantFirstName, setTenantFirstName] = useState(initialData?.tenant.firstName ?? "")
  const [tenantLastName,  setTenantLastName]  = useState(initialData?.tenant.lastName  ?? "")
  const [tenantPhone,     setTenantPhone]     = useState(initialData?.tenant.phone     ?? "")
  const [tenantEmail,     setTenantEmail]     = useState(initialData?.tenant.email     ?? "")

  // -----------------------------------------------------------------------
  // Form field state — Section 3
  // -----------------------------------------------------------------------

  const [missionId,    setMissionId]    = useState(initialData?.missionId  ?? "")
  const [rentalPrice,  setRentalPrice]  = useState(
    initialData?.rentalPrice != null ? String(initialData.rentalPrice) : ""
  )
  const [providerFee,  setProviderFee]  = useState(
    initialData?.providerFee != null ? String(initialData.providerFee) : ""
  )
  const [note,         setNote]         = useState(initialData?.note ?? "")

  // Whether provider_fee was auto-filled from provider_pricing
  const [isFeeAuto, setIsFeeAuto] = useState(
    // In edit mode, mark as auto if pricing_id is set
    mode === "edit" && initialData?.pricingId != null
  )

  // -----------------------------------------------------------------------
  // Validation errors — keyed by field name
  // -----------------------------------------------------------------------

  const [errors,      setErrors]      = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  // -----------------------------------------------------------------------
  // Derived: owner_id needed for tenant INSERT and pricing queries.
  //
  // - Owner role:    ownerIdContext = their own userId (known immediately)
  // - Provider role: ownerIdContext = owner of the selected listing
  //                  (resolved asynchronously when listingId changes)
  // -----------------------------------------------------------------------

  const [ownerIdContext, setOwnerIdContext] = useState<string | null>(
    userRole === "owner" ? userId : null
  )

  // -----------------------------------------------------------------------
  // EFFECT: fetch listings on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    async function fetchListings() {
      if (userRole === "owner") {
        // Owners fetch listings they manage via owner_listing junction
        const { data } = await supabase
          .from("owner_listing")
          .select("listing_id, listings(id, name)")
          .eq("owner_id", userId)

        if (data) {
          const opts = data
            .map((row) => {
              const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings
              if (!listing) return null
              return { id: listing.id, name: listing.name }
            })
            .filter((x): x is ListingOption => x !== null)
          setListings(opts)
          // In create mode, pre-select if exactly one listing
          if (opts.length === 1 && mode === "create") setListingId(opts[0].id)
        }
      } else {
        // Provider: BUG-013 — no direct FK between owner_provider and owner_listing,
        // so we split into two explicit queries instead of a nested embed.

        // Step 1 — get the owner_ids this provider works for
        const { data: ownerRows } = await supabase
          .from("owner_provider")
          .select("owner_id")
          .eq("provider_id", userId)

        if (!ownerRows || ownerRows.length === 0) {
          setListings([])
          return
        }

        const ownerIds = ownerRows.map((r) => r.owner_id)

        // Step 2 — get listings for those owners.
        // owner_listing_select RLS was extended to allow providers who work
        // with the owner to read these rows (migration 20260415000000).
        const { data: listingRows } = await supabase
          .from("owner_listing")
          .select("listing_id, listings(id, name)")
          .in("owner_id", ownerIds)

        if (listingRows) {
          const opts: ListingOption[] = []
          listingRows.forEach((row) => {
            const listing = Array.isArray(row.listings) ? row.listings[0] : row.listings
            if (listing && !opts.find((o) => o.id === listing.id)) {
              opts.push({ id: listing.id, name: listing.name })
            }
          })
          setListings(opts)
          if (opts.length === 1 && mode === "create") setListingId(opts[0].id)
        }
      }
    }

    fetchListings()
    // Only run once on mount — userId and userRole are stable props
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // EFFECT: resolve ownerIdContext from selected listingId (provider only)
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (userRole !== "provider" || !listingId) {
      if (userRole !== "provider") return
      setOwnerIdContext(null)
      return
    }

    async function resolveOwner() {
      // BUG-009: owner_listing is accessible to providers via the extended RLS policy.
      // We query it directly to find the owner_id for the selected listing.
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

  // -----------------------------------------------------------------------
  // EFFECT: fetch providers on mount (owner role only)
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (userRole !== "owner") {
      // Providers are always themselves — no dropdown needed
      setProviders([{ id: userId, firstName, lastName: "" }])
      // Don't overwrite edit-mode initialData.providerId
      if (mode === "create") setProviderId(userId)
      return
    }

    async function fetchProviders() {
      // WHY "users!provider_id": owner_provider has two FKs to users.
      // Without the hint, PostgREST cannot tell which FK to follow.
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
        if (opts.length === 1 && mode === "create") setProviderId(opts[0].id)
      }
    }

    fetchProviders()
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // -----------------------------------------------------------------------
  // EFFECT: fetch missions when ownerIdContext is known
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!ownerIdContext) {
      setMissions([])
      // In create mode, also clear the selection
      if (mode === "create") setMissionId("")
      return
    }

    async function fetchMissions() {
      const { data } = await supabase
        .from("missions")
        .select("id, label, owner_id, created_at")
        .eq("owner_id", ownerIdContext!)
        .order("created_at", { ascending: true })

      if (data && data.length > 0) {
        const opts = data.map((m) => ({ id: m.id, label: m.label, ownerId: m.owner_id }))
        setMissions(opts)
        // In create mode, default to the earliest mission
        if (mode === "create") setMissionId(opts[0].id)
        // In edit mode, preserve the initialData missionId (already set in state init)
      } else {
        setMissions([])
        if (mode === "create") setMissionId("")
      }
    }

    fetchMissions()
  }, [ownerIdContext, supabase, mode])

  // -----------------------------------------------------------------------
  // Auto-fill provider_fee from provider_pricing when relevant fields change
  // -----------------------------------------------------------------------

  // BUG-016: track whether user has manually edited the fee since last auto-fill.
  // Use a ref (not state) to avoid infinite re-render loops.
  const feeWasManuallyEdited = useRef(false)

  const runAutoFill = useCallback(async (
    currentProviderId: string,
    currentMissionId: string,
    currentOwnerIdContext: string | null,
  ) => {
    // Skip auto-fill for providers — they cannot edit the fee anyway
    if (userRole === "provider") return
    if (!currentProviderId || !currentMissionId || !currentOwnerIdContext) {
      setIsFeeAuto(false)
      return
    }
    // BUG-016: don't overwrite a manually entered value when mission/provider changes
    if (feeWasManuallyEdited.current) return

    const { data: pricingRows } = await supabase
      .from("provider_pricing")
      .select("id, fee, provider_pricing_missions(mission_id)")
      .eq("owner_id", currentOwnerIdContext)
      .eq("provider_id", currentProviderId)

    if (!pricingRows) {
      setIsFeeAuto(false)
      return
    }

    const match = (pricingRows as PricingRow[]).find((p) =>
      p.provider_pricing_missions.some((m) => m.mission_id === currentMissionId)
    )

    if (match) {
      setProviderFee(String(match.fee))
      setIsFeeAuto(true)
    } else {
      setIsFeeAuto(false)
    }
  }, [supabase, userRole])

  useEffect(() => {
    runAutoFill(providerId, missionId, ownerIdContext)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, missionId, ownerIdContext])

  // -----------------------------------------------------------------------
  // Validation (shared for both create and edit)
  // -----------------------------------------------------------------------

  function validate(): boolean {
    const newErrors: Record<string, string> = {}

    if (!listingId)       newErrors.listingId       = LABELS.proprieteRequired
    // Provider is required for providers (pre-filled); optional for owners
    if (userRole !== "owner" && !providerId) newErrors.providerId = LABELS.prestataireRequired
    if (!source)          newErrors.source          = LABELS.sourceRequired
    if (!checkIn)         newErrors.checkIn         = LABELS.arriveeRequired
    if (!checkOut)        newErrors.checkOut        = LABELS.departRequired
    if (!nbPax)           newErrors.nbPax           = LABELS.nbVoyageursRequired
    if (!tenantFirstName) newErrors.tenantFirstName = LABELS.prenomRequired
    if (!tenantLastName)  newErrors.tenantLastName  = LABELS.nomRequired
    // Mission: optional for owners, required for providers
    if (userRole !== "owner" && !missionId) newErrors.missionId = LABELS.missionRequired
    if (!rentalPrice)     newErrors.rentalPrice     = LABELS.prixLocationRequired

    // check_out must be strictly after check_in
    if (checkIn && checkOut && checkOut <= checkIn) {
      newErrors.checkOut = LABELS.departAfterArrivee
    }

    // rental_price must be > 0
    if (rentalPrice && parseFloat(rentalPrice) <= 0) {
      newErrors.rentalPrice = LABELS.prixLocationMin
    }

    // nb_pax must be >= 1
    if (nbPax && parseInt(nbPax, 10) < 1) {
      newErrors.nbPax = LABELS.nbVoyageursMin
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // -----------------------------------------------------------------------
  // Submit handler — CREATE path (3-step INSERT with rollback on failure)
  // -----------------------------------------------------------------------

  async function handleCreate() {
    const tenantOwnerId = userRole === "owner" ? userId : ownerIdContext

    if (!tenantOwnerId) {
      setSubmitError(LABELS.submitError)
      return
    }

    // Step 1 — INSERT tenant
    const { data: tenant, error: tenantError } = await supabase
      .from("tenants")
      .insert({
        owner_id:   tenantOwnerId,
        first_name: tenantFirstName.trim(),
        last_name:  tenantLastName.trim(),
        phone:      tenantPhone.trim()  || null,
        email:      tenantEmail.trim()  || null,
      })
      .select("id")
      .single()

    if (tenantError || !tenant) {
      setSubmitError(LABELS.submitError)
      return
    }

    // Step 2 — INSERT booking
    const { data: booking, error: bookingError } = await supabase
      .from("bookings")
      .insert({
        listing_id:     listingId,
        // BUG-012: coerce empty string to null — uuid column rejects ""
        provider_id:    providerId   || null,
        tenant_id:      tenant.id,
        pricing_id:     null,
        check_in:       checkIn,
        check_in_time:  checkInTime  || null,
        check_out:      checkOut,
        check_out_time: checkOutTime || null,
        source:         source,
        nb_pax:         parseInt(nbPax, 10),
        rental_price:   parseFloat(rentalPrice),
        currency:       "EUR",
        provider_fee:   providerFee !== "" ? parseFloat(providerFee) : 0,
        status:         "pending",
        note:           note.trim()  || null,
      })
      .select("id")
      .single()

    if (bookingError || !booking) {
      // Rollback orphaned tenant using SECURITY DEFINER RPC (BUG-011)
      await supabase.rpc("delete_orphaned_tenant", { p_tenant_id: tenant.id })
      setSubmitError(LABELS.submitError)
      return
    }

    // Step 3 — INSERT booking_missions (optional for owners)
    if (missionId) {
      const { error: missionError } = await supabase
        .from("booking_missions")
        .insert({ booking_id: booking.id, mission_id: missionId })

      if (missionError) {
        await supabase.from("bookings").delete().eq("id", booking.id)
        await supabase.rpc("delete_orphaned_tenant", { p_tenant_id: tenant.id })
        setSubmitError(LABELS.submitError)
        return
      }
    }

    // Success — navigate with toast signal in sessionStorage
    sessionStorage.setItem("booking_toast", LABELS.toastCreated)
    router.push("/reservations")
  }

  // -----------------------------------------------------------------------
  // Submit handler — EDIT path (UPDATE bookings, tenants, booking_missions)
  // -----------------------------------------------------------------------

  async function handleEdit() {
    if (!initialData) return

    // Step 1 — UPDATE bookings
    // Providers cannot change provider_fee or pricing_id (DB trigger also blocks it)
    const bookingUpdate: Record<string, unknown> = {
      listing_id:     listingId,
      check_in:       checkIn,
      check_in_time:  checkInTime  || null,
      check_out:      checkOut,
      check_out_time: checkOutTime || null,
      source:         source,
      nb_pax:         parseInt(nbPax, 10),
      rental_price:   parseFloat(rentalPrice),
      status:         status,
      note:           note.trim()  || null,
    }

    // Only owners can change provider and fee fields
    if (userRole === "owner") {
      // BUG-012: coerce empty string → null for uuid column
      bookingUpdate.provider_id = providerId || null
      bookingUpdate.provider_fee = providerFee !== "" ? parseFloat(providerFee) : 0
      // pricing_id: if fee is still auto, keep pricingId; if user cleared auto, set null
      bookingUpdate.pricing_id = isFeeAuto ? initialData.pricingId : null
    }

    const { error: bookingError } = await supabase
      .from("bookings")
      .update(bookingUpdate)
      .eq("id", initialData.id)

    if (bookingError) {
      setSubmitError(LABELS.submitError)
      return
    }

    // Step 2 — UPDATE tenants if any tenant field changed
    const tenantChanged =
      tenantFirstName.trim() !== initialData.tenant.firstName ||
      tenantLastName.trim()  !== initialData.tenant.lastName  ||
      (tenantPhone.trim() || null) !== initialData.tenant.phone ||
      (tenantEmail.trim() || null) !== initialData.tenant.email

    if (tenantChanged) {
      const { error: tenantError } = await supabase
        .from("tenants")
        .update({
          first_name: tenantFirstName.trim(),
          last_name:  tenantLastName.trim(),
          phone:      tenantPhone.trim()  || null,
          email:      tenantEmail.trim()  || null,
        })
        .eq("id", initialData.tenantId)

      if (tenantError) {
        setSubmitError(LABELS.submitError)
        return
      }
    }

    // Step 3 — Reconcile booking_missions (delete old, insert new if changed)
    const missionChanged = missionId !== (initialData.missionId ?? "")

    if (missionChanged) {
      // Delete existing mission rows for this booking (CASCADE handles related data)
      const { error: deleteError } = await supabase
        .from("booking_missions")
        .delete()
        .eq("booking_id", initialData.id)

      if (deleteError) {
        setSubmitError(LABELS.submitError)
        return
      }

      // Insert new mission row if one is selected
      if (missionId) {
        const { error: insertError } = await supabase
          .from("booking_missions")
          .insert({ booking_id: initialData.id, mission_id: missionId })

        if (insertError) {
          setSubmitError(LABELS.submitError)
          return
        }
      }
    }

    // Success — navigate with toast signal in sessionStorage
    sessionStorage.setItem("booking_toast", LABELS.toastUpdated)
    router.push("/reservations")
  }

  // -----------------------------------------------------------------------
  // Unified submit handler
  // -----------------------------------------------------------------------

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitError(null)

    if (!validate()) return

    setIsSubmitting(true)
    try {
      if (mode === "create") {
        await handleCreate()
      } else {
        await handleEdit()
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  const hasNoListings  = listings.length === 0
  const hasNoProviders = userRole === "owner" && providers.length === 0
  const isSubmitBlocked = hasNoListings

  // Shared class for <select> elements
  const selectCls = (fieldKey: string) =>
    [
      "h-11 w-full rounded-lg border bg-white px-3 text-sm leading-[1.5] text-neutral-900",
      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 focus:border-primary",
      "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-neutral-50",
      errors[fieldKey] ? "border-error" : "border-neutral-200",
    ].join(" ")

  // Whether the provider fee is locked (providers cannot edit it)
  const isFeeFieldLocked = userRole === "provider"
  // Whether the prestataire field is locked (providers cannot change it)
  const isProviderFieldLocked = userRole === "provider"

  // Page title depends on mode
  const pageTitle = mode === "create" ? LABELS.pageTitleCreate : LABELS.pageTitleEdit

  // Submit button label depends on mode
  const submitLabel = mode === "create" ? LABELS.creer : LABELS.enregistrer

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="min-h-screen bg-neutral-50">

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                              */}
      {/* ------------------------------------------------------------------ */}
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

      {/* ------------------------------------------------------------------ */}
      {/* Main — scrollable form body                                        */}
      {/* pb-28 keeps content above the sticky footer                        */}
      {/* Desktop: max-w-2xl centres the card on wide screens               */}
      {/* ------------------------------------------------------------------ */}
      <main className="px-4 py-6 pb-28 max-w-2xl mx-auto flex flex-col gap-1 lg:max-w-screen-lg">

        {/* Page title */}
        <div className="px-1 pb-3">
          <h1 className="text-base font-semibold text-neutral-900">
            {pageTitle}
          </h1>
        </div>

        {/* id links the sticky footer submit button to this form element */}
        <form id="booking-form" onSubmit={handleSubmit} noValidate>

          {/* ============================================================ */}
          {/* SECTION 0 — Statut (edit mode only)                          */}
          {/* ============================================================ */}
          {mode === "edit" && (
            <>
              <div className="rounded-lg border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                  <h2 className="text-sm font-semibold text-neutral-900">
                    {LABELS.section0Title}
                  </h2>
                </div>
                <div className="px-4 py-4 flex flex-col gap-2">
                  {/* Status dropdown with French labels. Free-set: any status → any status. */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      {/* Live badge preview so the user sees the colour as they select */}
                      <StatusBadge variant={STATUS_BADGE_VARIANT[status]}>
                        {STATUS_LABELS[status]}
                      </StatusBadge>
                    </div>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as BookingStatus)}
                      className={selectCls("status")}
                    >
                      {(Object.entries(STATUS_LABELS) as [BookingStatus, string][]).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                </div>
              </div>

              {/* Connector line */}
              <div className="flex justify-center py-1">
                <div className="w-px h-4 bg-neutral-300" />
              </div>
            </>
          )}

          {/* ============================================================ */}
          {/* SECTION 1 — Réservation                                       */}
          {/* ============================================================ */}
          <div className="rounded-lg border border-neutral-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-neutral-50 border-b border-neutral-200">
              <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-semibold text-primary-foreground">1</span>
              </div>
              <h2 className="text-sm font-semibold text-neutral-900">
                {LABELS.section1Title}
              </h2>
            </div>

            <div className="px-4 py-4 flex flex-col gap-4">

              {/* ---- Propriété ------------------------------------------ */}
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
                        setErrors((prev) => { const n = { ...prev }; delete n.listingId; return n })
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

              {/* ---- Prestataire ---------------------------------------- */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-neutral-900">
                    {LABELS.prestataire}
                  </label>
                  {userRole === "owner" && (
                    <span className="text-xs text-neutral-400">{LABELS.prestataireOptional}</span>
                  )}
                </div>

                {isProviderFieldLocked ? (
                  // Providers see a locked read-only display of their own name
                  <div className="relative">
                    <div className={[
                      "h-11 w-full rounded-lg border border-neutral-200 bg-neutral-50",
                      "px-3 pr-10 flex items-center text-sm text-neutral-500 cursor-not-allowed",
                    ].join(" ")}>
                      {/* Show provider name from initialData (edit) or firstName (create) */}
                      {mode === "edit" && initialData?.providerName
                        ? initialData.providerName
                        : firstName}
                    </div>
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
                    <p className="text-xs text-neutral-500 mt-1">
                      {LABELS.prestataireProviderHelper}
                    </p>
                  </div>
                ) : hasNoProviders ? (
                  <>
                    <select disabled className={selectCls("providerId")}>
                      <option>{LABELS.prestataireSelect}</option>
                    </select>
                    <p className="text-xs text-neutral-500">
                      {LABELS.prestataireEmptyOwner}
                    </p>
                  </>
                ) : (
                  <>
                    <select
                      value={providerId}
                      onChange={(e) => {
                        setProviderId(e.target.value)
                        // Reset auto-fill tracking when provider changes (BUG-016)
                        feeWasManuallyEdited.current = false
                        setIsFeeAuto(false)
                        setErrors((prev) => { const n = { ...prev }; delete n.providerId; return n })
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

              {/* ---- Source (segmented toggle) -------------------------- */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-neutral-900">
                  {LABELS.source}
                </label>
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

              {/* ---- Dates — 2-column grid ------------------------------ */}
              <div className="grid grid-cols-2 gap-3">
                <InputField
                  label={LABELS.arrivee}
                  type="date"
                  value={checkIn}
                  onChange={(e) => {
                    setCheckIn(e.target.value)
                    setErrors((prev) => { const n = { ...prev }; delete n.checkIn; delete n.checkOut; return n })
                  }}
                  error={errors.checkIn}
                />
                <InputField
                  label={LABELS.depart}
                  type="date"
                  value={checkOut}
                  onChange={(e) => {
                    setCheckOut(e.target.value)
                    setErrors((prev) => { const n = { ...prev }; delete n.checkOut; return n })
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

              {/* ---- Nombre de voyageurs -------------------------------- */}
              <InputField
                label={LABELS.nbVoyageurs}
                type="number"
                min={1}
                value={nbPax}
                onChange={(e) => {
                  setNbPax(e.target.value)
                  setErrors((prev) => { const n = { ...prev }; delete n.nbPax; return n })
                }}
                error={errors.nbPax}
              />

            </div>
          </div>

          {/* Connector line */}
          <div className="flex justify-center py-1">
            <div className="w-px h-4 bg-neutral-300" />
          </div>

          {/* ============================================================ */}
          {/* SECTION 2 — Locataire                                         */}
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
                    setErrors((prev) => { const n = { ...prev }; delete n.tenantFirstName; return n })
                  }}
                  error={errors.tenantFirstName}
                />
                <InputField
                  label={LABELS.nom}
                  type="text"
                  value={tenantLastName}
                  onChange={(e) => {
                    setTenantLastName(e.target.value)
                    setErrors((prev) => { const n = { ...prev }; delete n.tenantLastName; return n })
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

          {/* Connector line */}
          <div className="flex justify-center py-1">
            <div className="w-px h-4 bg-neutral-300" />
          </div>

          {/* ============================================================ */}
          {/* SECTION 3 — Mission & Tarifs                                  */}
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

              {/* ---- Mission -------------------------------------------- */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-neutral-900">
                    {LABELS.mission}
                  </label>
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
                        // Reset auto-fill tracking when mission changes (BUG-016)
                        feeWasManuallyEdited.current = false
                        setIsFeeAuto(false)
                        setErrors((prev) => { const n = { ...prev }; delete n.missionId; return n })
                      }}
                      className={selectCls("missionId")}
                    >
                      <option value="">{LABELS.missionSelect}</option>
                      {missions.map((m) => (
                        <option key={m.id} value={m.id}>{m.label}</option>
                      ))}
                    </select>
                    {errors.missionId && (
                      <p className="text-xs text-error">{errors.missionId}</p>
                    )}
                  </>
                )}
              </div>

              {/* ---- Prix location -------------------------------------- */}
              {/* Editable for BOTH roles — providers can edit rental price */}
              <InputField
                label={LABELS.prixLocation}
                type="number"
                min={0}
                step="0.01"
                value={rentalPrice}
                onChange={(e) => {
                  setRentalPrice(e.target.value)
                  setErrors((prev) => { const n = { ...prev }; delete n.rentalPrice; return n })
                }}
                error={errors.rentalPrice}
              />

              {/* ---- Frais prestataire — locked for providers ------------ */}
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-neutral-900">
                    {LABELS.fraisPrestataire}
                  </label>
                  {isFeeAuto && (
                    // "Auto" badge — shown when fee was auto-filled from provider_pricing
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary-light text-primary border border-primary">
                      {LABELS.fraisAutoLabel}
                    </span>
                  )}
                  {isFeeFieldLocked && (
                    // Lock icon for providers — fee is not editable
                    <Lock className="h-3.5 w-3.5 text-neutral-400" />
                  )}
                </div>

                {isFeeFieldLocked ? (
                  // Read-only display for providers — greyed out
                  <div className={[
                    "h-11 w-full rounded-lg border border-neutral-200 bg-neutral-50",
                    "px-3 flex items-center text-sm text-neutral-500 cursor-not-allowed",
                  ].join(" ")}>
                    {providerFee !== "" ? `${providerFee} €` : "—"}
                  </div>
                ) : (
                  // Editable input for owners
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={providerFee}
                    onChange={(e) => {
                      setProviderFee(e.target.value)
                      // Manual edit removes auto badge and sets the manual flag (BUG-016)
                      feeWasManuallyEdited.current = true
                      setIsFeeAuto(false)
                      setErrors((prev) => { const n = { ...prev }; delete n.providerFee; return n })
                    }}
                    className={[
                      "h-11 w-full rounded-lg border px-3 text-sm leading-[1.5] text-neutral-900",
                      "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-0 focus:border-primary",
                      isFeeAuto
                        ? "bg-primary-light border-primary font-semibold text-primary"
                        : "bg-white border-neutral-200",
                      errors.providerFee ? "border-error" : "",
                    ].join(" ")}
                  />
                )}
                {errors.providerFee && (
                  <p className="text-xs text-error">{errors.providerFee}</p>
                )}
                {isFeeFieldLocked && (
                  <p className="text-xs text-neutral-500">{LABELS.fraisLocked}</p>
                )}
              </div>

              {/* ---- Note ----------------------------------------------- */}
              <InputField
                label={LABELS.note}
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />

            </div>
          </div>

          {/* Generic error shown when DB operation fails unexpectedly */}
          {submitError && (
            <p className="text-sm text-error text-center pt-3" role="alert">
              {submitError}
            </p>
          )}

        </form>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Sticky footer — Annuler + Submit                                   */}
      {/* Always visible on mobile (375px). Centred at max-width on desktop. */}
      {/* ------------------------------------------------------------------ */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 px-4 py-3 flex gap-3 md:max-w-2xl md:mx-auto lg:max-w-screen-lg">
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
          {submitLabel}
        </Button>
      </div>

    </div>
  )
}
