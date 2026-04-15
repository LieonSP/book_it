-- ============================================================
-- UP
-- Row Level Security (RLS) policies for all Book_it tables.
--
-- Why RLS? Supabase exposes the database directly to the client
-- via PostgREST. Without RLS, any authenticated user could read
-- or write any row. RLS enforces per-row access rules at the
-- database level, so even if the frontend has a bug, data leakage
-- between owners or providers is impossible.
--
-- Two roles are in use:
--   owner    — manages listings, providers, and bookings
--   provider — executes bookings assigned to them
--
-- auth.uid() returns the UUID of the currently authenticated user.
-- It is the only safe way to identify the caller — never use
-- hardcoded IDs or session variables from the application layer.
-- ============================================================


-- ============================================================
-- ENABLE RLS
-- RLS must be enabled on every table before policies take effect.
-- A table with RLS enabled but no policies denies all access by
-- default (for non-superusers), which is the safe starting point.
-- ============================================================

ALTER TABLE public.users                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_listing            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_provider           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_pricing         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_pricing_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_missions         ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- TABLE: users
-- Owners can see and update their own profile plus any providers
-- they manage. Providers can only see and update their own row.
-- No user can insert or delete rows — admin creates users via
-- the Supabase dashboard (auth.users + public.users).
-- ============================================================

-- Owners: SELECT their own row, and the rows of providers they manage.
-- Providers: SELECT their own row only.
CREATE POLICY "users_select"
  ON public.users
  FOR SELECT
  USING (
    -- The user is reading their own row.
    id = auth.uid()
    OR
    -- The current user is an owner AND the row belongs to one of
    -- their providers (linked via owner_provider).
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      WHERE op.owner_id    = auth.uid()
        AND op.provider_id = public.users.id
    )
  );

-- Owners: UPDATE their own row, and the rows of providers they manage.
-- Providers: UPDATE their own row only.
CREATE POLICY "users_update"
  ON public.users
  FOR UPDATE
  USING (
    -- The user is updating their own row.
    id = auth.uid()
    OR
    -- The current user is an owner AND the row belongs to one of
    -- their providers.
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      WHERE op.owner_id    = auth.uid()
        AND op.provider_id = public.users.id
    )
  );

-- No INSERT policy — rows are created by admin only.
-- No DELETE policy — rows are deleted by admin only.


-- ============================================================
-- TABLE: listings
-- Owners can fully manage listings they own (via owner_listing).
-- Providers can only read listings that are linked to one of
-- their own bookings (they need the listing name/address in UI).
-- ============================================================

-- Owners: SELECT listings they manage.
-- Providers: SELECT listings that appear in their bookings.
CREATE POLICY "listings_select"
  ON public.listings
  FOR SELECT
  USING (
    -- Owner has a row in owner_listing linking them to this listing.
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.listings.id
    )
    OR
    -- Provider has at least one booking for this listing.
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.provider_id = auth.uid()
        AND b.listing_id  = public.listings.id
    )
  );

-- Owners: INSERT new listings (any owner can create a listing;
-- the owner_listing row is inserted separately to attach it).
-- The WITH CHECK always evaluates to TRUE here because at INSERT
-- time the listing has no owner yet — ownership is linked via
-- owner_listing immediately after.
CREATE POLICY "listings_insert"
  ON public.listings
  FOR INSERT
  WITH CHECK (
    -- Only users with role 'owner' may create listings.
    EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.id   = auth.uid()
        AND u.type = 'owner'
    )
  );

-- Owners: UPDATE only their own listings.
CREATE POLICY "listings_update"
  ON public.listings
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.listings.id
    )
  );

-- Owners: DELETE only their own listings.
CREATE POLICY "listings_delete"
  ON public.listings
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.listings.id
    )
  );


-- ============================================================
-- TABLE: tenants
-- Tenants are scoped to the owner who created them (owner_id).
-- Providers can read/update tenants linked to their bookings.
-- Providers may insert tenants only if they belong to an owner
-- they work for — this prevents a rogue provider from creating
-- tenants under an unrelated owner.
-- ============================================================

-- Owners: SELECT tenants they created.
-- Providers: SELECT tenants whose bookings they own.
CREATE POLICY "tenants_select"
  ON public.tenants
  FOR SELECT
  USING (
    -- Owner sees tenants they created.
    owner_id = auth.uid()
    OR
    -- Provider sees tenants linked to their bookings.
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.provider_id = auth.uid()
        AND b.tenant_id   = public.tenants.id
    )
  );

-- Owners: INSERT tenants owned by themselves.
-- Providers: INSERT tenants only if owner_id belongs to an owner
--            they work for (prevents cross-owner data injection).
CREATE POLICY "tenants_insert"
  ON public.tenants
  FOR INSERT
  WITH CHECK (
    -- Owner inserts a tenant they own directly.
    owner_id = auth.uid()
    OR
    -- Provider inserts a tenant for an owner they work with.
    EXISTS (
      SELECT 1
      FROM public.owner_provider op
      WHERE op.provider_id = auth.uid()
        AND op.owner_id    = public.tenants.owner_id
    )
  );

-- Owners: UPDATE their own tenants.
-- Providers: UPDATE tenants linked to their bookings.
CREATE POLICY "tenants_update"
  ON public.tenants
  FOR UPDATE
  USING (
    -- Owner updates tenants they created.
    owner_id = auth.uid()
    OR
    -- Provider updates tenants linked to their bookings.
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.provider_id = auth.uid()
        AND b.tenant_id   = public.tenants.id
    )
  );

-- Owners: DELETE their own tenants only. Providers cannot delete.
CREATE POLICY "tenants_delete"
  ON public.tenants
  FOR DELETE
  USING (
    owner_id = auth.uid()
  );


-- ============================================================
-- TABLE: owner_listing
-- This is a junction table linking owners to their listings.
-- Only the owner whose row this is can see or modify it.
-- Providers have no access — they don't need to know which
-- owner manages which listing (they find listings via bookings).
-- ============================================================

-- Owners: SELECT their own rows only.
CREATE POLICY "owner_listing_select"
  ON public.owner_listing
  FOR SELECT
  USING (
    owner_id = auth.uid()
  );

-- Owners: INSERT new owner→listing links for themselves.
CREATE POLICY "owner_listing_insert"
  ON public.owner_listing
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
  );

-- Owners: UPDATE their own rows (e.g. future metadata changes).
CREATE POLICY "owner_listing_update"
  ON public.owner_listing
  FOR UPDATE
  USING (
    owner_id = auth.uid()
  );

-- Owners: DELETE their own rows (unlinking a listing).
CREATE POLICY "owner_listing_delete"
  ON public.owner_listing
  FOR DELETE
  USING (
    owner_id = auth.uid()
  );


-- ============================================================
-- TABLE: owner_provider
-- Junction table linking owners to the providers they manage.
-- Owners manage their side; providers can read their own rows
-- so they can discover which owners they work for.
-- ============================================================

-- Owners: SELECT their own rows (providers they manage).
-- Providers: SELECT rows where they are the provider (to know
--            which owners they work for — needed for booking INSERT).
CREATE POLICY "owner_provider_select"
  ON public.owner_provider
  FOR SELECT
  USING (
    owner_id    = auth.uid()
    OR
    provider_id = auth.uid()
  );

-- Owners: INSERT new owner→provider relationships.
CREATE POLICY "owner_provider_insert"
  ON public.owner_provider
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
  );

-- Owners: UPDATE their own rows.
CREATE POLICY "owner_provider_update"
  ON public.owner_provider
  FOR UPDATE
  USING (
    owner_id = auth.uid()
  );

-- Owners: DELETE (remove a provider from their roster).
CREATE POLICY "owner_provider_delete"
  ON public.owner_provider
  FOR DELETE
  USING (
    owner_id = auth.uid()
  );


-- ============================================================
-- TABLE: missions
-- Mission types are defined per owner (owner_id = auth.uid()).
-- Providers can read missions that are linked to their bookings
-- (they see mission labels in their booking details).
-- ============================================================

-- Owners: SELECT missions they defined.
-- Providers: SELECT missions linked to their bookings via booking_missions.
CREATE POLICY "missions_select"
  ON public.missions
  FOR SELECT
  USING (
    -- Owner sees missions they created.
    owner_id = auth.uid()
    OR
    -- Provider sees missions attached to their bookings.
    EXISTS (
      SELECT 1
      FROM public.booking_missions bm
      JOIN public.bookings b ON b.id = bm.booking_id
      WHERE b.provider_id  = auth.uid()
        AND bm.mission_id  = public.missions.id
    )
  );

-- Owners: INSERT missions for themselves.
CREATE POLICY "missions_insert"
  ON public.missions
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
  );

-- Owners: UPDATE their own missions.
CREATE POLICY "missions_update"
  ON public.missions
  FOR UPDATE
  USING (
    owner_id = auth.uid()
  );

-- Owners: DELETE their own missions.
CREATE POLICY "missions_delete"
  ON public.missions
  FOR DELETE
  USING (
    owner_id = auth.uid()
  );


-- ============================================================
-- TABLE: provider_pricing
-- Pricing presets belong to an owner (owner_id) for a specific
-- provider. The owner manages all fields; the provider can
-- read their own pricing rows to display agreed fees in the UI.
-- ============================================================

-- Owners: SELECT their pricing presets.
-- Providers: SELECT presets where they are the provider.
CREATE POLICY "provider_pricing_select"
  ON public.provider_pricing
  FOR SELECT
  USING (
    owner_id    = auth.uid()
    OR
    provider_id = auth.uid()
  );

-- Owners: INSERT pricing presets they own.
CREATE POLICY "provider_pricing_insert"
  ON public.provider_pricing
  FOR INSERT
  WITH CHECK (
    owner_id = auth.uid()
  );

-- Owners: UPDATE their own pricing presets.
CREATE POLICY "provider_pricing_update"
  ON public.provider_pricing
  FOR UPDATE
  USING (
    owner_id = auth.uid()
  );

-- Owners: DELETE their own pricing presets.
CREATE POLICY "provider_pricing_delete"
  ON public.provider_pricing
  FOR DELETE
  USING (
    owner_id = auth.uid()
  );


-- ============================================================
-- TABLE: provider_pricing_missions
-- Junction table linking pricing presets to the missions they
-- cover. Access is derived entirely from the parent
-- provider_pricing row — if you can see the pricing preset,
-- you can see (or manage) its mission links.
-- ============================================================

-- Owners AND Providers: SELECT rows whose pricing preset they can see.
CREATE POLICY "provider_pricing_missions_select"
  ON public.provider_pricing_missions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.provider_pricing pp
      WHERE pp.id         = public.provider_pricing_missions.pricing_id
        AND (pp.owner_id = auth.uid() OR pp.provider_id = auth.uid())
    )
  );

-- Owners: INSERT mission links for their pricing presets.
CREATE POLICY "provider_pricing_missions_insert"
  ON public.provider_pricing_missions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.provider_pricing pp
      WHERE pp.id      = public.provider_pricing_missions.pricing_id
        AND pp.owner_id = auth.uid()
    )
  );

-- Owners: UPDATE mission links for their pricing presets.
CREATE POLICY "provider_pricing_missions_update"
  ON public.provider_pricing_missions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.provider_pricing pp
      WHERE pp.id      = public.provider_pricing_missions.pricing_id
        AND pp.owner_id = auth.uid()
    )
  );

-- Owners: DELETE mission links for their pricing presets.
CREATE POLICY "provider_pricing_missions_delete"
  ON public.provider_pricing_missions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.provider_pricing pp
      WHERE pp.id      = public.provider_pricing_missions.pricing_id
        AND pp.owner_id = auth.uid()
    )
  );


-- ============================================================
-- TABLE: bookings
-- The core table of the application. Both owners and providers
-- can create and update bookings, but within strict boundaries:
--   - Owners: full control over bookings on their listings.
--   - Providers: can read/update/insert their own bookings only;
--     they must use status = 'cancelled' instead of deleting.
--
-- INSERT rules enforce:
--   - Owner: the listing must be in their owner_listing.
--   - Provider: provider_id must be auth.uid() AND the listing
--     must belong to an owner they work for (via owner_provider).
-- ============================================================

-- Owners: SELECT bookings on their listings.
-- Providers: SELECT their own bookings.
CREATE POLICY "bookings_select"
  ON public.bookings
  FOR SELECT
  USING (
    -- Owner sees bookings for listings they manage.
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.bookings.listing_id
    )
    OR
    -- Provider sees bookings where they are assigned.
    provider_id = auth.uid()
  );

-- Owners: INSERT bookings — listing_id must be in their owner_listing.
-- Providers: INSERT bookings — provider_id must be auth.uid() AND
--            the listing must belong to one of their owners.
CREATE POLICY "bookings_insert"
  ON public.bookings
  FOR INSERT
  WITH CHECK (
    -- Owner inserts: they must own the listing.
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.bookings.listing_id
    )
    OR
    (
      -- Provider inserts: they must be the assigned provider...
      provider_id = auth.uid()
      AND
      -- ...and the listing must belong to an owner they work for.
      EXISTS (
        SELECT 1
        FROM public.owner_listing ol
        JOIN public.owner_provider op ON op.owner_id = ol.owner_id
        WHERE ol.listing_id  = public.bookings.listing_id
          AND op.provider_id = auth.uid()
      )
    )
  );

-- Owners: UPDATE bookings on their listings.
-- Providers: UPDATE their own bookings only.
CREATE POLICY "bookings_update"
  ON public.bookings
  FOR UPDATE
  USING (
    -- Owner can update bookings on their listings.
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.bookings.listing_id
    )
    OR
    -- Provider can update their own bookings.
    provider_id = auth.uid()
  );

-- Owners: DELETE bookings on their listings.
-- Providers: cannot delete — they must set status = 'cancelled'.
CREATE POLICY "bookings_delete"
  ON public.bookings
  FOR DELETE
  USING (
    -- Only owners can hard-delete bookings.
    EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      WHERE ol.owner_id   = auth.uid()
        AND ol.listing_id = public.bookings.listing_id
    )
  );


-- ============================================================
-- TABLE: booking_missions
-- Junction table linking bookings to the missions performed.
-- Access is derived from the parent booking row — if you can
-- access the booking, you can manage its mission links.
-- Both owners (via their listings) and providers (via their
-- bookings) have INSERT/UPDATE/DELETE on this table.
-- ============================================================

-- Owners: SELECT via their listings' bookings.
-- Providers: SELECT via their own bookings.
CREATE POLICY "booking_missions_select"
  ON public.booking_missions
  FOR SELECT
  USING (
    -- Owner can see mission links for bookings on their listings.
    EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.owner_listing ol ON ol.listing_id = b.listing_id
      WHERE b.id          = public.booking_missions.booking_id
        AND ol.owner_id   = auth.uid()
    )
    OR
    -- Provider can see mission links for their own bookings.
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id          = public.booking_missions.booking_id
        AND b.provider_id = auth.uid()
    )
  );

-- Owners: INSERT mission links for bookings on their listings.
-- Providers: INSERT mission links for their own bookings.
CREATE POLICY "booking_missions_insert"
  ON public.booking_missions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.owner_listing ol ON ol.listing_id = b.listing_id
      WHERE b.id        = public.booking_missions.booking_id
        AND ol.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id          = public.booking_missions.booking_id
        AND b.provider_id = auth.uid()
    )
  );

-- Owners: UPDATE mission links for bookings on their listings.
-- Providers: UPDATE mission links for their own bookings.
CREATE POLICY "booking_missions_update"
  ON public.booking_missions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.owner_listing ol ON ol.listing_id = b.listing_id
      WHERE b.id        = public.booking_missions.booking_id
        AND ol.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id          = public.booking_missions.booking_id
        AND b.provider_id = auth.uid()
    )
  );

-- Owners: DELETE mission links for bookings on their listings.
-- Providers: DELETE mission links for their own bookings.
CREATE POLICY "booking_missions_delete"
  ON public.booking_missions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1
      FROM public.bookings b
      JOIN public.owner_listing ol ON ol.listing_id = b.listing_id
      WHERE b.id        = public.booking_missions.booking_id
        AND ol.owner_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1
      FROM public.bookings b
      WHERE b.id          = public.booking_missions.booking_id
        AND b.provider_id = auth.uid()
    )
  );


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- To roll back, copy these statements to a new migration file
-- or run them manually in the Supabase SQL editor.
-- ============================================================

-- -- DROP POLICY IF EXISTS "booking_missions_delete"          ON public.booking_missions;
-- -- DROP POLICY IF EXISTS "booking_missions_update"          ON public.booking_missions;
-- -- DROP POLICY IF EXISTS "booking_missions_insert"          ON public.booking_missions;
-- -- DROP POLICY IF EXISTS "booking_missions_select"          ON public.booking_missions;
-- -- DROP POLICY IF EXISTS "bookings_delete"                  ON public.bookings;
-- -- DROP POLICY IF EXISTS "bookings_update"                  ON public.bookings;
-- -- DROP POLICY IF EXISTS "bookings_insert"                  ON public.bookings;
-- -- DROP POLICY IF EXISTS "bookings_select"                  ON public.bookings;
-- -- DROP POLICY IF EXISTS "provider_pricing_missions_delete" ON public.provider_pricing_missions;
-- -- DROP POLICY IF EXISTS "provider_pricing_missions_update" ON public.provider_pricing_missions;
-- -- DROP POLICY IF EXISTS "provider_pricing_missions_insert" ON public.provider_pricing_missions;
-- -- DROP POLICY IF EXISTS "provider_pricing_missions_select" ON public.provider_pricing_missions;
-- -- DROP POLICY IF EXISTS "provider_pricing_delete"          ON public.provider_pricing;
-- -- DROP POLICY IF EXISTS "provider_pricing_update"          ON public.provider_pricing;
-- -- DROP POLICY IF EXISTS "provider_pricing_insert"          ON public.provider_pricing;
-- -- DROP POLICY IF EXISTS "provider_pricing_select"          ON public.provider_pricing;
-- -- DROP POLICY IF EXISTS "missions_delete"                  ON public.missions;
-- -- DROP POLICY IF EXISTS "missions_update"                  ON public.missions;
-- -- DROP POLICY IF EXISTS "missions_insert"                  ON public.missions;
-- -- DROP POLICY IF EXISTS "missions_select"                  ON public.missions;
-- -- DROP POLICY IF EXISTS "owner_provider_delete"            ON public.owner_provider;
-- -- DROP POLICY IF EXISTS "owner_provider_update"            ON public.owner_provider;
-- -- DROP POLICY IF EXISTS "owner_provider_insert"            ON public.owner_provider;
-- -- DROP POLICY IF EXISTS "owner_provider_select"            ON public.owner_provider;
-- -- DROP POLICY IF EXISTS "owner_listing_delete"             ON public.owner_listing;
-- -- DROP POLICY IF EXISTS "owner_listing_update"             ON public.owner_listing;
-- -- DROP POLICY IF EXISTS "owner_listing_insert"             ON public.owner_listing;
-- -- DROP POLICY IF EXISTS "owner_listing_select"             ON public.owner_listing;
-- -- DROP POLICY IF EXISTS "tenants_delete"                   ON public.tenants;
-- -- DROP POLICY IF EXISTS "tenants_update"                   ON public.tenants;
-- -- DROP POLICY IF EXISTS "tenants_insert"                   ON public.tenants;
-- -- DROP POLICY IF EXISTS "tenants_select"                   ON public.tenants;
-- -- DROP POLICY IF EXISTS "listings_delete"                  ON public.listings;
-- -- DROP POLICY IF EXISTS "listings_update"                  ON public.listings;
-- -- DROP POLICY IF EXISTS "listings_insert"                  ON public.listings;
-- -- DROP POLICY IF EXISTS "listings_select"                  ON public.listings;
-- -- DROP POLICY IF EXISTS "users_update"                     ON public.users;
-- -- DROP POLICY IF EXISTS "users_select"                     ON public.users;
-- --
-- -- ALTER TABLE public.booking_missions          DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.bookings                  DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.provider_pricing_missions DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.provider_pricing          DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.missions                  DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.owner_provider            DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.owner_listing             DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.tenants                   DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.listings                  DISABLE ROW LEVEL SECURITY;
-- -- ALTER TABLE public.users                     DISABLE ROW LEVEL SECURITY;
