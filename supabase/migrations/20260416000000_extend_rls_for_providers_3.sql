-- ============================================================
-- UP
--
-- Extends two RLS policies to fix provider booking creation.
--
-- FIX 1 — tenants_select
-- -----------------------
-- When a provider inserts a tenant as part of booking creation,
-- the INSERT succeeds but the subsequent .select("id").single()
-- is blocked: tenants_select only allows providers to read tenants
-- they are already linked to via an existing booking. But no booking
-- exists yet at that point in the 3-step INSERT flow.
-- Result: tenant.id is null → form shows "Impossible de créer la
-- réservation" and the orphaned tenant is never cleaned up.
-- Fix: add an owner_provider arm — providers can read tenants for
-- any owner they work with, before a booking is created.
--
-- FIX 2 — listings_select
-- -------------------------
-- Providers could only read listings they already had existing
-- bookings on (via the bookings arm of listings_select). This meant
-- they could not see listings belonging to owners they work with
-- unless they had created at least one booking on that listing before.
-- Fix: add an owner_provider + owner_listing arm, identical in spirit
-- to the extension already applied to owner_listing_select and
-- missions_select in migration 20260415000000.
-- ============================================================


-- ------------------------------------------------------------
-- FIX 1 — tenants_select
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "tenants_select" ON public.tenants;

CREATE POLICY "tenants_select"
  ON public.tenants
  FOR SELECT
  USING (
    -- Owners can read all tenants they own.
    owner_id = auth.uid()
    OR
    -- Providers can read tenants linked to their own bookings.
    -- (original arm — kept for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.provider_id = auth.uid()
        AND b.tenant_id   = public.tenants.id
    )
    OR
    -- Providers can read tenants for any owner they work with.
    -- WHY: the booking form inserts a tenant before the booking.
    -- Without this arm, a provider cannot SELECT the just-inserted
    -- tenant (no booking links them yet), so tenant.id comes back
    -- null and the form fails with a generic error.
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      WHERE op.provider_id = auth.uid()
        AND op.owner_id    = public.tenants.owner_id
    )
  );


-- ------------------------------------------------------------
-- FIX 2 — listings_select
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "listings_select" ON public.listings;

CREATE POLICY "listings_select"
  ON public.listings
  FOR SELECT
  USING (
    -- Owners can read listings they manage.
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.listings.id
    )
    OR
    -- Providers can read listings they already have bookings on.
    -- (original arm — kept for backward compatibility)
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.provider_id = auth.uid()
        AND b.listing_id  = public.listings.id
    )
    OR
    -- Providers can read ALL listings for owners they work with.
    -- WHY: previously providers could only see listings where they
    -- already had a booking, blocking them from selecting a listing
    -- on which they would create their FIRST booking.
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      JOIN public.owner_listing  ol ON ol.owner_id = op.owner_id
      WHERE op.provider_id  = auth.uid()
        AND ol.listing_id   = public.listings.id
    )
  );


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- ============================================================

-- -- DROP POLICY IF EXISTS "tenants_select"  ON public.tenants;
-- -- DROP POLICY IF EXISTS "listings_select" ON public.listings;
-- --
-- -- CREATE POLICY "tenants_select"
-- --   ON public.tenants FOR SELECT
-- --   USING (
-- --     owner_id = auth.uid()
-- --     OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.provider_id = auth.uid() AND b.tenant_id = public.tenants.id)
-- --   );
-- --
-- -- CREATE POLICY "listings_select"
-- --   ON public.listings FOR SELECT
-- --   USING (
-- --     EXISTS (SELECT 1 FROM public.owner_listing ol WHERE ol.owner_id = auth.uid() AND ol.listing_id = public.listings.id)
-- --     OR EXISTS (SELECT 1 FROM public.bookings b WHERE b.provider_id = auth.uid() AND b.listing_id = public.listings.id)
-- --   );
