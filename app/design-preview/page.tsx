// app/design-preview/page.tsx
// TEMPORARY — delete after design is approved

import { ChevronLeft } from "lucide-react"
import Image from "next/image"

export default function DesignPreview() {
  return (
    <div className="min-h-screen bg-neutral-50 py-8">

      {/* Header */}
      <div className="max-w-sm mx-auto px-4 mb-8">
        <p className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">Design Preview</p>
        <h1 className="text-xl font-semibold text-neutral-900">Issue #67 — Navigation retour</h1>
        <p className="text-sm text-neutral-500 mt-1">Review the 3 versions below, then tell the designer which one to build.</p>
        <p className="text-xs text-neutral-500 mt-2 bg-primary-light rounded p-2">
          Chaque version montre 2 états : dashboard (logo visible) et sous-page (navigation retour active).
        </p>
      </div>

      {/* Version 1 */}
      <div className="max-w-sm mx-auto px-4 mb-12">
        <div className="mb-3 pb-2 border-b border-neutral-200">
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">Version 1</span>
          <h2 className="text-base font-semibold text-neutral-900">Flèche remplace l&apos;image, nom reste</h2>
          <p className="text-xs text-neutral-500 mt-0.5">L&apos;icône maison est remplacée par une flèche ← ; le texte &quot;Book_it&quot; reste visible à côté.</p>
        </div>
        <Version1 />
      </div>

      {/* Version 2 */}
      <div className="max-w-sm mx-auto px-4 mb-12">
        <div className="mb-3 pb-2 border-b border-neutral-200">
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">Version 2</span>
          <h2 className="text-base font-semibold text-neutral-900">Bouton &quot;← Retour&quot; avec label</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Le bloc gauche entier devient un bouton &quot;← Retour&quot; avec texte — action très explicite pour tous les utilisateurs.</p>
        </div>
        <Version2 />
      </div>

      {/* Version 3 */}
      <div className="max-w-sm mx-auto px-4 mb-12">
        <div className="mb-3 pb-2 border-b border-neutral-200">
          <span className="text-xs font-semibold text-primary uppercase tracking-wide">Version 3</span>
          <h2 className="text-base font-semibold text-neutral-900">Flèche seule + titre de la page</h2>
          <p className="text-xs text-neutral-500 mt-0.5">Flèche seule à gauche, titre de l&apos;écran centré — style navigation native iOS/Android.</p>
        </div>
        <Version3 />
      </div>

    </div>
  )
}

// ─── Shared mock avatar + logout ──────────────────────────────────────────────

function RightSlot() {
  return (
    <div className="flex items-center gap-1">
      <div className="h-8 w-8 rounded-full bg-primary-light flex items-center justify-center">
        <span className="text-xs font-semibold text-primary">A</span>
      </div>
      <button
        type="button"
        className="h-8 w-8 flex items-center justify-center rounded text-neutral-500 hover:text-neutral-900"
        disabled
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </div>
  )
}

function StateLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-neutral-500 mb-1 mt-3">{label}</p>
  )
}

// ─── VERSION 1 ────────────────────────────────────────────────────────────────
// Logo image swapped for a chevron icon; "Book_it" text stays next to it.
// The left slot stays the same width and visual weight — just the icon changes.

function Version1() {
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white">

      <StateLabel label="État 1 — Tableau de bord (logo visible, pas de flèche)" />
      {/* Dashboard state: logo image + app name, same as today */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <button type="button" disabled className="flex items-center gap-2.5 rounded cursor-default">
          <Image src="/logo-transparent.png" alt="Book_it" width={32} height={32} className="rounded-sm" />
          <p className="text-sm font-semibold text-neutral-900">
            Book<span className="text-primary">_it</span>
          </p>
        </button>
        <RightSlot />
      </header>

      <StateLabel label="État 2 — Sous-page (flèche ← remplace l'image, texte reste)" />
      {/* Sub-page state: chevron replaces image, "Book_it" text stays */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <button
          type="button"
          className="flex items-center gap-2 rounded cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-11"
          aria-label="Retour à la page précédente"
        >
          <span className="h-8 w-8 flex items-center justify-center rounded-sm text-primary">
            <ChevronLeft size={24} strokeWidth={2.5} />
          </span>
          <p className="text-sm font-semibold text-neutral-900">
            Book<span className="text-primary">_it</span>
          </p>
        </button>
        <RightSlot />
      </header>

      <div className="px-4 pb-3 pt-2">
        <p className="text-xs text-neutral-500">
          ✅ Changement minimal — le poids visuel du header reste identique.<br />
          ✅ Le nom de l&apos;app est toujours visible.<br />
          ⚠️ La flèche sans label peut ne pas être évidente au premier coup d&apos;œil.
        </p>
      </div>
    </div>
  )
}

// ─── VERSION 2 ────────────────────────────────────────────────────────────────
// The entire left slot becomes a "← Retour" text button.
// Very explicit — no ambiguity about what the action does.

function Version2() {
  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white">

      <StateLabel label="État 1 — Tableau de bord (logo visible, pas de flèche)" />
      {/* Dashboard state: same as today */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <button type="button" disabled className="flex items-center gap-2.5 rounded cursor-default">
          <Image src="/logo-transparent.png" alt="Book_it" width={32} height={32} className="rounded-sm" />
          <p className="text-sm font-semibold text-neutral-900">
            Book<span className="text-primary">_it</span>
          </p>
        </button>
        <RightSlot />
      </header>

      <StateLabel label="État 2 — Sous-page (bouton ← Retour remplace le logo + nom)" />
      {/* Sub-page state: "← Retour" pill replaces entire left block */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-primary hover:bg-primary-light transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary min-h-11"
          aria-label="Retour à la page précédente"
        >
          <ChevronLeft size={20} strokeWidth={2.5} />
          <span className="text-sm font-semibold">Retour</span>
        </button>
        <RightSlot />
      </header>

      <div className="px-4 pb-3 pt-2">
        <p className="text-xs text-neutral-500">
          ✅ Le plus clair pour tous les utilisateurs (texte explicite).<br />
          ✅ Cohérent avec les conventions mobiles modernes (iOS, Android).<br />
          ⚠️ Le nom de l&apos;app disparaît — contexte légèrement réduit.
        </p>
      </div>
    </div>
  )
}

// ─── VERSION 3 ────────────────────────────────────────────────────────────────
// Back arrow alone on the left, page title centred in the header.
// Native app navigation pattern — logo and app name both hidden on sub-pages.

function Version3() {
  // Simulated page titles per route
  const pageTitles: Record<string, string> = {
    "/reservations": "Réservations",
    "/reservations/nouvelle": "Nouvelle réservation",
    "/reservations/modifier": "Modifier réservation",
    "/synthese": "Synthèse mensuelle",
  }
  const currentTitle = pageTitles["/reservations"]

  return (
    <div className="border border-neutral-200 rounded-xl overflow-hidden bg-white">

      <StateLabel label="État 1 — Tableau de bord (logo visible, pas de flèche)" />
      {/* Dashboard state: same as today */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-neutral-200 bg-white">
        <button type="button" disabled className="flex items-center gap-2.5 rounded cursor-default">
          <Image src="/logo-transparent.png" alt="Book_it" width={32} height={32} className="rounded-sm" />
          <p className="text-sm font-semibold text-neutral-900">
            Book<span className="text-primary">_it</span>
          </p>
        </button>
        <RightSlot />
      </header>

      <StateLabel label="État 2 — Sous-page (flèche seule + titre centré)" />
      {/* Sub-page state: back arrow left, page title centred, avatar right */}
      <header className="relative flex items-center px-4 py-3 border-b border-neutral-200 bg-white min-h-[56px]">
        {/* Back arrow — absolute left */}
        <button
          type="button"
          className="flex items-center justify-center h-11 w-11 -ml-1.5 rounded-lg text-primary hover:bg-primary-light transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Retour à la page précédente"
        >
          <ChevronLeft size={24} strokeWidth={2.5} />
        </button>

        {/* Page title — centred absolutely so it doesn't shift with button widths */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-semibold text-neutral-900">{currentTitle}</span>
        </div>

        {/* Right slot — absolute right */}
        <div className="ml-auto">
          <RightSlot />
        </div>
      </header>

      <div className="px-4 pb-3 pt-2">
        <p className="text-xs text-neutral-500">
          ✅ Style navigation native — très familier pour les utilisateurs mobile.<br />
          ✅ Le titre centré donne immédiatement le contexte de la page.<br />
          ⚠️ Nécessite d&apos;ajouter un prop &quot;pageTitle&quot; à AppHeader (changement légèrement plus large).
        </p>
      </div>
    </div>
  )
}
