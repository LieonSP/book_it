-- =============================================================================
-- Issue #33 — Scenario 1: Owner sees only their own bookings in the list
--
-- Given:  Owner A has 2 bookings; Owner B has 1 booking
-- When:   Owner A queries bookings (as authenticated user)
-- Then:   2 rows are returned; Owner B's booking is invisible
--
-- HOW: SET LOCAL role = 'authenticated' + set_config JWT sub forces auth.uid()
-- to resolve to the test user's UUID. The postgres role bypasses RLS otherwise.
-- =============================================================================

-- ----------------------------------------------------------------
-- Setup: idempotent fixture (ON CONFLICT DO NOTHING)
-- UUIDs chosen to avoid clashing with the existing rls_policies.sql fixtures
-- ----------------------------------------------------------------
BEGIN;

-- Auth users
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
  aud, role, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
VALUES
  ('bb000001-0000-0000-0000-000000000001', 'owner33a@test.book-it', '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('bb000001-0000-0000-0000-000000000002', 'owner33b@test.book-it', '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- Public users
INSERT INTO public.users (id, type, first_name, last_name, email)
VALUES
  ('bb000001-0000-0000-0000-000000000001', 'owner', 'AliceQA', 'OwnerA33', 'owner33a@test.book-it'),
  ('bb000001-0000-0000-0000-000000000002', 'owner', 'BobQA',   'OwnerB33', 'owner33b@test.book-it')
ON CONFLICT (id) DO NOTHING;

-- Listings
INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES
  ('bb000001-0000-0000-0000-000000000010', 'Villa A33', '1 rue Test', '75001', 'Paris'),
  ('bb000001-0000-0000-0000-000000000011', 'Villa B33', '2 rue Test', '75001', 'Paris')
ON CONFLICT (id) DO NOTHING;

-- owner_listing (junction)
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('bb000001-0000-0000-0000-000000000001', 'bb000001-0000-0000-0000-000000000010'),
  ('bb000001-0000-0000-0000-000000000002', 'bb000001-0000-0000-0000-000000000011')
ON CONFLICT DO NOTHING;

-- Tenants
INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES
  ('bb000001-0000-0000-0000-000000000020', 'bb000001-0000-0000-0000-000000000001', 'Tenant', 'A1'),
  ('bb000001-0000-0000-0000-000000000021', 'bb000001-0000-0000-0000-000000000001', 'Tenant', 'A2'),
  ('bb000001-0000-0000-0000-000000000022', 'bb000001-0000-0000-0000-000000000002', 'Tenant', 'B1')
ON CONFLICT (id) DO NOTHING;

-- Bookings: 2 for Owner A, 1 for Owner B
INSERT INTO public.bookings (id, listing_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee)
VALUES
  ('bb000001-0000-0000-0000-000000000030', 'bb000001-0000-0000-0000-000000000010', 'bb000001-0000-0000-0000-000000000020', '2026-05-01', '2026-05-05', 'airbnb', 2, 500.00, 80.00),
  ('bb000001-0000-0000-0000-000000000031', 'bb000001-0000-0000-0000-000000000010', 'bb000001-0000-0000-0000-000000000021', '2026-05-10', '2026-05-15', 'direct', 1, 600.00, 90.00),
  ('bb000001-0000-0000-0000-000000000032', 'bb000001-0000-0000-0000-000000000011', 'bb000001-0000-0000-0000-000000000022', '2026-05-03', '2026-05-07', 'airbnb', 3, 700.00, 100.00)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------
-- Test: Owner A sees exactly 2 bookings (their own), not Owner B's
-- Expected: booking_count = 2 and cannot_see_owner_b_booking = 1
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  '{"sub": "bb000001-0000-0000-0000-000000000001"}', TRUE);

SELECT
  COUNT(*)                                                                    AS booking_count,
  COUNT(*) FILTER (WHERE id = 'bb000001-0000-0000-0000-000000000032')         AS owner_b_booking_visible
FROM public.bookings;
-- Expected: booking_count = 2, owner_b_booking_visible = 0

ROLLBACK;
