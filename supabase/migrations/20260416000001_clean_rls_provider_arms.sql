-- ============================================================
-- UP
--
-- Removes the "via existing bookings" arms from listings_select
-- and tenants_select for providers.
--
-- WHY:
-- The original policies allowed providers to read listings/tenants
-- if they had an existing booking linking them. This is wrong:
-- it uses historical booking data as the access control check instead
-- of the actual owner-provider relationship (owner_provider table).
--
-- Consequence of the wrong design:
-- A provider who is removed from owner_provider can still read listings
-- and tenants they had bookings on — a data isolation breach.
--
-- The owner_provider arm added in 20260416000000 is the correct and
-- complete check. The bookings-based arms are redundant and unsafe.
-- ============================================================


-- ------------------------------------------------------------
-- listings_select — remove bookings arm, keep owner_provider arm
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "listings_select" ON public.listings;

CREATE POLICY "listings_select"
  ON public.listings
  FOR SELECT
  USING (
    -- Owners can read listings they manage (via owner_listing junction).
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.listings.id
    )
    OR
    -- Providers can read listings for owners they currently work with.
    -- WHY owner_provider and not bookings: the relationship between a
    -- provider and an owner is defined in owner_provider. Using bookings
    -- would allow a removed provider to still read listings via old
    -- bookings — a data leak. owner_provider is the source of truth.
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      JOIN public.owner_listing  ol ON ol.owner_id = op.owner_id
      WHERE op.provider_id  = auth.uid()
        AND ol.listing_id   = public.listings.id
    )
  );


-- ------------------------------------------------------------
-- tenants_select — remove bookings arm, keep owner_provider arm
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "tenants_select" ON public.tenants;

CREATE POLICY "tenants_select"
  ON public.tenants
  FOR SELECT
  USING (
    -- Owners can read all tenants they own.
    owner_id = auth.uid()
    OR
    -- Providers can read tenants for owners they currently work with.
    -- WHY owner_provider and not bookings: same reasoning as listings_select.
    -- A provider who is no longer linked to an owner should not read that
    -- owner's tenants. owner_provider reflects the current relationship.
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      WHERE op.provider_id = auth.uid()
        AND op.owner_id    = public.tenants.owner_id
    )
  );


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- ============================================================

-- -- DROP POLICY IF EXISTS "listings_select" ON public.listings;
-- -- DROP POLICY IF EXISTS "tenants_select"  ON public.tenants;
-- --
-- -- Restore with bookings arms (see 20260416000000 for previous version)
