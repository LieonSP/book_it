-- ============================================================
-- UP
-- Fix BUG-002: Provider cannot insert bookings.
--
-- ROOT CAUSE
-- ----------
-- The provider arm of the "bookings_insert" policy contained a
-- subquery that JOINed owner_listing and owner_provider:
--
--   EXISTS (
--     SELECT 1
--     FROM public.owner_listing ol
--     JOIN public.owner_provider op ON op.owner_id = ol.owner_id
--     WHERE ol.listing_id  = public.bookings.listing_id
--       AND op.provider_id = auth.uid()
--   )
--
-- Policy subqueries run as the *calling user* (the provider), so
-- they are subject to RLS themselves. The "owner_listing_select"
-- policy only lets rows through when owner_id = auth.uid(). A
-- provider is never an owner, so owner_listing returns 0 rows for
-- them, the EXISTS is always FALSE, and every INSERT by a provider
-- is silently rejected.
--
-- WHY SECURITY DEFINER IS THE CORRECT FIX
-- ----------------------------------------
-- A SECURITY DEFINER function runs with the privileges of the
-- function owner (the DB superuser / postgres role) rather than
-- the calling user. This means the SELECT inside the function
-- bypasses RLS completely and can freely read owner_listing and
-- owner_provider to answer the question:
--   "Does at least one owner of this listing employ this provider?"
--
-- This is safe because:
--   1. The function is read-only (STABLE, SELECT only).
--   2. It accepts explicit arguments — it cannot be tricked into
--      leaking data for a different listing or provider.
--   3. SET search_path = public prevents search-path injection.
--   4. The result (true/false) reveals nothing beyond the yes/no
--      answer needed to authorise the INSERT.
--
-- POLICIES REVIEWED — NO OTHER CHANGES NEEDED
-- ---------------------------------------------
-- bookings_select  — provider arm uses `provider_id = auth.uid()`
--                    (direct column check, no owner_listing). OK.
-- bookings_update  — provider arm uses `provider_id = auth.uid()`
--                    (direct column check, no owner_listing). OK.
-- listings_select  — provider arm queries bookings on
--                    `provider_id = auth.uid()`, which providers
--                    CAN read via the bookings_select policy. OK.
-- ============================================================


-- ------------------------------------------------------------
-- Step 1: Create the SECURITY DEFINER helper function.
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.provider_can_access_listing(
  p_listing_id  uuid,
  p_provider_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Fixing the search_path prevents a malicious user from shadowing
-- public tables with identically named objects in another schema.
SET search_path = public
AS $$
  -- Returns TRUE if the given provider works for at least one owner
  -- of the given listing. Runs as the DB owner, bypassing RLS.
  SELECT EXISTS (
    SELECT 1
    FROM public.owner_listing ol
    JOIN public.owner_provider op ON op.owner_id = ol.owner_id
    WHERE ol.listing_id   = p_listing_id
      AND op.provider_id  = p_provider_id
  );
$$;


-- ------------------------------------------------------------
-- Step 2: Replace the broken bookings_insert policy.
-- ------------------------------------------------------------

-- Drop the old policy first; PostgreSQL does not support
-- CREATE OR REPLACE for RLS policies.
DROP POLICY IF EXISTS "bookings_insert" ON public.bookings;

CREATE POLICY "bookings_insert"
  ON public.bookings
  FOR INSERT
  WITH CHECK (
    -- OWNER path: the listing must belong to the inserting owner.
    -- This subquery only reads owner_listing rows where
    -- owner_id = auth.uid(), which the owner_listing_select policy
    -- already permits. No change needed here.
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.bookings.listing_id
    )
    OR
    (
      -- PROVIDER path:
      -- 1. The booking must be assigned to the provider themselves
      --    (they cannot insert bookings on behalf of others).
      provider_id = auth.uid()
      AND
      -- 2. The listing must belong to an owner they work for.
      --    We call the SECURITY DEFINER helper so the inner
      --    owner_listing query runs as the DB owner and bypasses
      --    the RLS restriction that would otherwise return 0 rows
      --    for a provider.
      public.provider_can_access_listing(
        public.bookings.listing_id,
        auth.uid()
      )
    )
  );


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- To roll back, copy these statements to a new migration file
-- or run them manually in the Supabase SQL editor.
-- ============================================================

-- -- DROP POLICY IF EXISTS "bookings_insert" ON public.bookings;
-- --
-- -- -- Restore the original (broken) policy — kept here for reference only.
-- -- CREATE POLICY "bookings_insert"
-- --   ON public.bookings
-- --   FOR INSERT
-- --   WITH CHECK (
-- --     EXISTS (
-- --       SELECT 1
-- --       FROM public.owner_listing ol
-- --       WHERE ol.owner_id   = auth.uid()
-- --         AND ol.listing_id = public.bookings.listing_id
-- --     )
-- --     OR
-- --     (
-- --       provider_id = auth.uid()
-- --       AND
-- --       EXISTS (
-- --         SELECT 1
-- --         FROM public.owner_listing ol
-- --         JOIN public.owner_provider op ON op.owner_id = ol.owner_id
-- --         WHERE ol.listing_id  = public.bookings.listing_id
-- --           AND op.provider_id = auth.uid()
-- --       )
-- --     )
-- --   );
-- --
-- -- DROP FUNCTION IF EXISTS public.provider_can_access_listing(uuid, uuid);
