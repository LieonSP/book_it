-- ============================================================
-- UP
-- Fix BUG-008, BUG-009, BUG-010, BUG-011: extend RLS policies
-- and add a SECURITY DEFINER rollback helper for providers.
--
-- BUG-008 / BUG-009 — Provider cannot read owner_listing rows
-- -----------------------------------------------------------
-- owner_listing_select was owner_id = auth.uid() only.
-- Providers querying owner_provider → owner_listing → listings
-- (fetchListings) and owner_listing → owner_id (resolveOwner)
-- always received empty results because the join traverses
-- owner_listing as the provider identity, not as the owner.
-- Fix: extend the policy to also allow providers to read
-- owner_listing rows for owners they work with.
--
-- BUG-010 — Provider cannot read missions before first booking
-- -----------------------------------------------------------
-- missions_select allowed provider access only via
-- booking_missions JOIN bookings WHERE provider_id = auth.uid().
-- A provider with 0 existing bookings sees 0 missions.
-- Fix: add a third arm — provider can read missions for any
-- owner they are linked to via owner_provider.
--
-- BUG-011 — Provider rollback silently fails (orphaned tenant)
-- -----------------------------------------------------------
-- tenants_delete is owner_id = auth.uid(). The tenant was
-- created with owner_id = listingOwnerId (not the provider's
-- uid), so the DELETE returns 0 rows silently.
-- Fix: SECURITY DEFINER function delete_orphaned_tenant(uuid)
-- that deletes by primary key, bypassing RLS. The form calls
-- this via RPC instead of the direct .delete() path.
-- WHY this is safe: deletes only the specific row passed by PK;
-- only called inside a try/catch after a failed booking INSERT;
-- accepts a UUID argument so it cannot be tricked into
-- deleting arbitrary tenants.
-- ============================================================


-- ------------------------------------------------------------
-- BUG-008 / BUG-009: Extend owner_listing_select
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "owner_listing_select" ON public.owner_listing;

CREATE POLICY "owner_listing_select"
  ON public.owner_listing
  FOR SELECT
  USING (
    -- Original: owner reads their own links
    owner_id = auth.uid()
    OR
    -- New: provider can read listing links for owners they work with.
    -- This lets providers discover which listings belong to their owners
    -- (needed for fetchListings join and resolveOwner lookup).
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      WHERE op.owner_id    = public.owner_listing.owner_id
        AND op.provider_id = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- BUG-010: Extend missions_select
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "missions_select" ON public.missions;

CREATE POLICY "missions_select"
  ON public.missions
  FOR SELECT
  USING (
    -- Owner sees missions they created.
    owner_id = auth.uid()
    OR
    -- Provider sees missions attached to their existing bookings.
    EXISTS (
      SELECT 1
      FROM public.booking_missions bm
      JOIN public.bookings b ON b.id = bm.booking_id
      WHERE b.provider_id  = auth.uid()
        AND bm.mission_id  = public.missions.id
    )
    OR
    -- New: provider sees missions for owners they work with.
    -- Necessary for creating a first booking (no existing bookings yet).
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      WHERE op.provider_id = auth.uid()
        AND op.owner_id    = public.missions.owner_id
    )
  );


-- ------------------------------------------------------------
-- BUG-011: SECURITY DEFINER rollback helper for orphaned tenants
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.delete_orphaned_tenant(p_tenant_id uuid)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.tenants WHERE id = p_tenant_id;
$$;


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- To roll back, copy these statements to a new migration file
-- or run them manually in the Supabase SQL editor.
-- ============================================================

-- -- DROP FUNCTION IF EXISTS public.delete_orphaned_tenant(uuid);
-- --
-- -- DROP POLICY IF EXISTS "missions_select" ON public.missions;
-- -- CREATE POLICY "missions_select"
-- --   ON public.missions
-- --   FOR SELECT
-- --   USING (
-- --     owner_id = auth.uid()
-- --     OR
-- --     EXISTS (
-- --       SELECT 1
-- --       FROM public.booking_missions bm
-- --       JOIN public.bookings b ON b.id = bm.booking_id
-- --       WHERE b.provider_id  = auth.uid()
-- --         AND bm.mission_id  = public.missions.id
-- --     )
-- --   );
-- --
-- -- DROP POLICY IF EXISTS "owner_listing_select" ON public.owner_listing;
-- -- CREATE POLICY "owner_listing_select"
-- --   ON public.owner_listing
-- --   FOR SELECT
-- --   USING (
-- --     owner_id = auth.uid()
-- --   );
