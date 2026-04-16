-- =============================================================================
-- Issue #33 — Scenario 8: DB trigger blocks provider from updating pricing_id
--
-- Given:  Provider P1 has a booking with a pricing_id set
-- When:   P1 directly calls UPDATE bookings SET pricing_id = NULL
-- Then:   DB trigger rejects the UPDATE; pricing_id is unchanged
-- =============================================================================

-- ----------------------------------------------------------------
-- Step 1: Setup — create owner, provider, pricing, and booking
-- ----------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
  aud, role, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
VALUES
  ('bb000008-0000-0000-0000-000000000001', 'owner33e@test.book-it', '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('bb000008-0000-0000-0000-000000000002', 'prov33u@test.book-it',  '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, last_name, email)
VALUES
  ('bb000008-0000-0000-0000-000000000001', 'owner',    'OwnerE33', 'E', 'owner33e@test.book-it'),
  ('bb000008-0000-0000-0000-000000000002', 'provider', 'ProvU33',  'U', 'prov33u@test.book-it')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES
  ('bb000008-0000-0000-0000-000000000010', 'Listing E33', '5 rue Test', '75004', 'Paris')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('bb000008-0000-0000-0000-000000000001', 'bb000008-0000-0000-0000-000000000010')
ON CONFLICT DO NOTHING;

INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('bb000008-0000-0000-0000-000000000001', 'bb000008-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- A pricing rule for this owner + provider
INSERT INTO public.provider_pricing (id, owner_id, provider_id, label, fee)
VALUES
  ('bb000008-0000-0000-0000-000000000040', 'bb000008-0000-0000-0000-000000000001', 'bb000008-0000-0000-0000-000000000002', 'Nettoyage E33', 80.00)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES
  ('bb000008-0000-0000-0000-000000000020', 'bb000008-0000-0000-0000-000000000001', 'TenantPricing', 'X')
ON CONFLICT (id) DO NOTHING;

-- Booking with pricing_id set
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, pricing_id, check_in, check_out, source, nb_pax, rental_price, provider_fee, status)
VALUES
  ('bb000008-0000-0000-0000-000000000030', 'bb000008-0000-0000-0000-000000000010', 'bb000008-0000-0000-0000-000000000002', 'bb000008-0000-0000-0000-000000000020', 'bb000008-0000-0000-0000-000000000040', '2026-08-01', '2026-08-05', 'airbnb', 2, 600.00, 80.00, 'pending')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------
-- Step 2: Verify initial state — pricing_id is set
-- ----------------------------------------------------------------
SELECT pricing_id AS initial_pricing_id
FROM public.bookings
WHERE id = 'bb000008-0000-0000-0000-000000000030';
-- Expected: bb000008-0000-0000-0000-000000000040

-- ----------------------------------------------------------------
-- Step 3: Provider attempts to set pricing_id = NULL — trigger blocks it
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  '{"sub": "bb000008-0000-0000-0000-000000000002"}', TRUE);

UPDATE public.bookings
SET pricing_id = NULL
WHERE id = 'bb000008-0000-0000-0000-000000000030';

ROLLBACK;

-- ----------------------------------------------------------------
-- Step 4: Verify pricing_id is still set (trigger blocked the update)
-- Expected: pricing_id = bb000008-0000-0000-0000-000000000040
-- ----------------------------------------------------------------
SELECT pricing_id AS pricing_id_after_blocked_update
FROM public.bookings
WHERE id = 'bb000008-0000-0000-0000-000000000030';
