-- =============================================================================
-- Book_it — RLS Policy Test Suite
-- Migration: 20260410000000_rls_policies.sql
-- Issue: #2
--
-- PURPOSE
-- -------
-- This script tests all 15 RLS scenarios defined in issue #2.
-- It runs against the book-it-dev Supabase project.
--
-- HOW USER IMPERSONATION WORKS
-- -----------------------------
-- Supabase PostgREST evaluates RLS policies by checking auth.uid(), which reads
-- the sub claim from the JWT supplied in the request. When running raw SQL via
-- the Supabase Management API (supabase db query --linked), we replicate this
-- mechanism with two statements inside a BEGIN/ROLLBACK block:
--
--   SET LOCAL role = 'authenticated';
--   SELECT set_config('request.jwt.claims', '{"sub": "UUID"}', TRUE);
--
-- auth.uid() in Supabase is defined as:
--   SELECT NULLIF(current_setting('request.jwt.claims', TRUE)::json->>'sub', '')::uuid
-- Setting those two lines makes auth.uid() return exactly the UUID we give it,
-- which causes RLS policies to evaluate as if that user is logged in.
--
-- IMPORTANT: SET LOCAL role = 'authenticated' is required because the management
-- API runs as the `postgres` role which has BYPASSRLS = true. Without switching
-- role, RLS would be bypassed entirely.
--
-- HOW TO RUN
-- ----------
-- Each scenario is a self-contained BEGIN/ROLLBACK block.
-- Run with: npx supabase db query --linked -f __tests__/rls_policies.sql
--
-- FIXED UUIDs USED
-- ----------------
-- Owner A:   aaaaaaaa-0001-0001-0001-000000000001
-- Owner B:   aaaaaaaa-0001-0001-0001-000000000002
-- Provider 1 (P1): aaaaaaaa-0001-0001-0001-000000000003
-- Provider 2 (P2): aaaaaaaa-0001-0001-0001-000000000004
-- =============================================================================


-- =============================================================================
-- SETUP — Create test users in auth.users + public.users
-- Run once before all scenarios. Idempotent (ON CONFLICT DO NOTHING).
-- =============================================================================
BEGIN;

INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
  aud, role, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'owner_a@test.book-it',  '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'owner_b@test.book-it',  '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'prov_1@test.book-it',   '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'prov_2@test.book-it',   '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, last_name, email, phone)
VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'owner',    'Alice',  'Owner',  'owner_a@test.book-it',  '+33600000001'),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'owner',    'Bob',    'Owner',  'owner_b@test.book-it',  '+33600000002'),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'provider', 'Paul',   'Prov1',  'prov_1@test.book-it',   '+33600000003'),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'provider', 'Pierre', 'Prov2',  'prov_2@test.book-it',   '+33600000004')
ON CONFLICT (id) DO NOTHING;

COMMIT;


-- =============================================================================
-- SCENARIO 1 — Unauthenticated user is denied on all tables
-- No role = authenticated, no JWT claims → auth.uid() returns NULL.
-- RLS default-deny means every table returns 0 rows.
-- Expected: 0 rows from every SELECT.
-- =============================================================================
BEGIN;
SET LOCAL ROLE anon;
SELECT
  (SELECT COUNT(*) FROM public.users)                    AS users,
  (SELECT COUNT(*) FROM public.listings)                 AS listings,
  (SELECT COUNT(*) FROM public.tenants)                  AS tenants,
  (SELECT COUNT(*) FROM public.owner_listing)            AS owner_listing,
  (SELECT COUNT(*) FROM public.owner_provider)           AS owner_provider,
  (SELECT COUNT(*) FROM public.missions)                 AS missions,
  (SELECT COUNT(*) FROM public.provider_pricing)         AS provider_pricing,
  (SELECT COUNT(*) FROM public.provider_pricing_missions) AS provider_pricing_missions,
  (SELECT COUNT(*) FROM public.bookings)                 AS bookings,
  (SELECT COUNT(*) FROM public.booking_missions)         AS booking_missions;
-- Expected: all 10 values = 0
ROLLBACK;


-- =============================================================================
-- SCENARIO 2 — Owner sees only their own listings
-- Owner A has listing L_A. Owner B has listing L_B.
-- When Owner A queries listings, only L_A appears (total = 1, sees_own = 1, sees_other = 0).
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('bbbbbbbb-0002-0002-0002-000000000001', 'Listing A S2', '1 rue A', '75001', 'Paris'),
  ('bbbbbbbb-0002-0002-0002-000000000002', 'Listing B S2', '2 rue B', '75002', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'bbbbbbbb-0002-0002-0002-000000000001'),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'bbbbbbbb-0002-0002-0002-000000000002');

-- Impersonate owner A
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000001"}', TRUE);

SELECT
  COUNT(*)                                                                              AS total_listings,
  COUNT(*) FILTER (WHERE id = 'bbbbbbbb-0002-0002-0002-000000000001')                  AS sees_own_listing,
  COUNT(*) FILTER (WHERE id = 'bbbbbbbb-0002-0002-0002-000000000002')                  AS sees_other_listing
FROM public.listings;
-- Expected: total_listings=1, sees_own_listing=1, sees_other_listing=0
ROLLBACK;


-- =============================================================================
-- SCENARIO 3 — Owner sees only bookings on their own listings
-- Owner A has a booking on L_A. Owner B has a booking on L_B.
-- Owner A should see only their booking (total=1, sees_own=1, sees_other=0).
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('cccccccc-0003-0003-0003-000000000001', 'L_A S3', '1 rue A', '75001', 'Paris'),
  ('cccccccc-0003-0003-0003-000000000002', 'L_B S3', '2 rue B', '75002', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'cccccccc-0003-0003-0003-000000000001'),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'cccccccc-0003-0003-0003-000000000002');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('cccccccc-0003-0003-0003-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001', 'T_A', 'S3'),
  ('cccccccc-0003-0003-0003-000000000004', 'aaaaaaaa-0001-0001-0001-000000000002', 'T_B', 'S3');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('cccccccc-0003-0003-0003-000000000005', 'cccccccc-0003-0003-0003-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', 'cccccccc-0003-0003-0003-000000000003', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80),
  ('cccccccc-0003-0003-0003-000000000006', 'cccccccc-0003-0003-0003-000000000002', 'aaaaaaaa-0001-0001-0001-000000000003', 'cccccccc-0003-0003-0003-000000000004', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000001"}', TRUE);

SELECT
  COUNT(*)                                                                              AS total_bookings,
  COUNT(*) FILTER (WHERE id = 'cccccccc-0003-0003-0003-000000000005')                  AS sees_own,
  COUNT(*) FILTER (WHERE id = 'cccccccc-0003-0003-0003-000000000006')                  AS sees_other
FROM public.bookings;
-- Expected: total_bookings=1, sees_own=1, sees_other=0
ROLLBACK;


-- =============================================================================
-- SCENARIO 4 — Provider sees only their own bookings
-- P1 and P2 each have a booking on the same listing.
-- P1 should see only their booking (total=1, sees_own_p1=1, sees_p2_booking=0).
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('dddddddd-0004-0004-0004-000000000001', 'L_A S4', '1 rue A', '75001', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'dddddddd-0004-0004-0004-000000000001');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('dddddddd-0004-0004-0004-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T1', 'S4'),
  ('dddddddd-0004-0004-0004-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001', 'T2', 'S4');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('dddddddd-0004-0004-0004-000000000004', 'dddddddd-0004-0004-0004-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', 'dddddddd-0004-0004-0004-000000000002', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80),
  ('dddddddd-0004-0004-0004-000000000005', 'dddddddd-0004-0004-0004-000000000001', 'aaaaaaaa-0001-0001-0001-000000000004', 'dddddddd-0004-0004-0004-000000000003', '2026-06-08', '2026-06-14', 'airbnb', 2, 500, 80);

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

SELECT
  COUNT(*)                                                                              AS total_bookings,
  COUNT(*) FILTER (WHERE id = 'dddddddd-0004-0004-0004-000000000004')                  AS sees_own_p1,
  COUNT(*) FILTER (WHERE id = 'dddddddd-0004-0004-0004-000000000005')                  AS sees_p2_booking
FROM public.bookings;
-- Expected: total_bookings=1, sees_own_p1=1, sees_p2_booking=0
ROLLBACK;


-- =============================================================================
-- SCENARIO 5 — Provider can read listing details (including note) for their bookings
-- P1 has booking on L1 (which has a note). L2 belongs to same owner, no booking for P1.
-- P1 sees L1 (including note field), does NOT see L2.
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city, note) VALUES
  ('eeeeeeee-0005-0005-0005-000000000001', 'L1 S5', '1 rue A', '75001', 'Paris', 'Secret note'),
  ('eeeeeeee-0005-0005-0005-000000000002', 'L2 S5', '2 rue B', '75001', 'Paris', NULL);
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'eeeeeeee-0005-0005-0005-000000000001'),
  ('aaaaaaaa-0001-0001-0001-000000000001', 'eeeeeeee-0005-0005-0005-000000000002');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('eeeeeeee-0005-0005-0005-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001', 'T', 'S5');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('eeeeeeee-0005-0005-0005-000000000004', 'eeeeeeee-0005-0005-0005-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', 'eeeeeeee-0005-0005-0005-000000000003', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

SELECT
  COUNT(*)                                                                              AS total_listings,
  COUNT(*) FILTER (WHERE id = 'eeeeeeee-0005-0005-0005-000000000001')                  AS sees_l1,
  COUNT(*) FILTER (WHERE id = 'eeeeeeee-0005-0005-0005-000000000002')                  AS sees_l2,
  MAX(note) FILTER (WHERE id = 'eeeeeeee-0005-0005-0005-000000000001')                 AS note_value
FROM public.listings;
-- Expected: total_listings=1, sees_l1=1, sees_l2=0, note_value='Secret note'
ROLLBACK;


-- =============================================================================
-- SCENARIO 6 — Provider can read and update tenant data for their bookings
-- P1 has booking referencing T1. T2 same owner but not linked to P1's bookings.
-- SELECT returns T1 only. UPDATE T1 succeeds. UPDATE T2 is silently rejected (0 rows).
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('ffffffff-0006-0006-0006-000000000001', 'L S6', '1 rue A', '75001', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'ffffffff-0006-0006-0006-000000000001');
INSERT INTO public.tenants (id, owner_id, first_name, last_name, phone) VALUES
  ('ffffffff-0006-0006-0006-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T1', 'S6', '+33100000001'),
  ('ffffffff-0006-0006-0006-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001', 'T2', 'S6', '+33100000002');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('ffffffff-0006-0006-0006-000000000004', 'ffffffff-0006-0006-0006-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', 'ffffffff-0006-0006-0006-000000000002', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

-- SELECT: P1 sees T1 only
SELECT
  COUNT(*)                                                                              AS total_tenants,
  COUNT(*) FILTER (WHERE id = 'ffffffff-0006-0006-0006-000000000002')                  AS sees_t1,
  COUNT(*) FILTER (WHERE id = 'ffffffff-0006-0006-0006-000000000003')                  AS sees_t2
FROM public.tenants;
-- Expected: total_tenants=1, sees_t1=1, sees_t2=0

-- UPDATE T1 (linked to booking) — should succeed
UPDATE public.tenants SET phone = '+33199999999' WHERE id = 'ffffffff-0006-0006-0006-000000000002';
-- UPDATE T2 (not linked) — should silently update 0 rows
UPDATE public.tenants SET phone = '+33188888888' WHERE id = 'ffffffff-0006-0006-0006-000000000003';

-- Verify: T1 shows updated phone, T2 not visible
SELECT id, phone FROM public.tenants
  WHERE id IN ('ffffffff-0006-0006-0006-000000000002', 'ffffffff-0006-0006-0006-000000000003')
  ORDER BY id;
-- Expected: 1 row: ffffffff-0006-0006-0006-000000000002 with phone='+33199999999'
ROLLBACK;


-- =============================================================================
-- SCENARIO 7 — Provider cannot insert a tenant with an unauthorized owner_id
-- P1 works for Owner A but NOT Owner B.
-- INSERT tenant with owner_id=B → RLS raises 42501 (new row violates policy).
-- This scenario is expected to produce an error — run separately to capture the error.
-- =============================================================================
BEGIN;
INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003');

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

-- This INSERT should raise: ERROR 42501: new row violates row-level security policy for table "tenants"
INSERT INTO public.tenants (owner_id, first_name, last_name)
  VALUES ('aaaaaaaa-0001-0001-0001-000000000002', 'Rogue', 'Tenant');
-- Expected: ERROR 42501 — test PASSES if the error is raised
ROLLBACK;


-- =============================================================================
-- SCENARIO 8 — Owner can read and update a provider's user profile
-- Owner A manages P1 (via owner_provider). Does NOT manage P2.
-- SELECT: Owner A sees self + P1 (2 rows), not P2, not Owner B.
-- UPDATE P1 succeeds. UPDATE P2 is silently rejected (0 rows).
-- =============================================================================
BEGIN;
INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003'),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000004');

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000001"}', TRUE);

SELECT
  COUNT(*)                                                                              AS total_users,
  COUNT(*) FILTER (WHERE id = 'aaaaaaaa-0001-0001-0001-000000000001')                  AS sees_self,
  COUNT(*) FILTER (WHERE id = 'aaaaaaaa-0001-0001-0001-000000000003')                  AS sees_p1,
  COUNT(*) FILTER (WHERE id = 'aaaaaaaa-0001-0001-0001-000000000004')                  AS sees_p2,
  COUNT(*) FILTER (WHERE id = 'aaaaaaaa-0001-0001-0001-000000000002')                  AS sees_owner_b
FROM public.users;
-- Expected: total_users=2, sees_self=1, sees_p1=1, sees_p2=0, sees_owner_b=0

-- UPDATE P1 (managed) — should succeed
UPDATE public.users SET phone = '+33177777777' WHERE id = 'aaaaaaaa-0001-0001-0001-000000000003';
-- UPDATE P2 (not managed) — should silently update 0 rows
UPDATE public.users SET phone = '+33166666666' WHERE id = 'aaaaaaaa-0001-0001-0001-000000000004';

-- Verify: P1 shows updated phone, P2 not visible
SELECT id, phone FROM public.users
  WHERE id IN ('aaaaaaaa-0001-0001-0001-000000000003', 'aaaaaaaa-0001-0001-0001-000000000004')
  ORDER BY id;
-- Expected: 1 row: aaaaaaaa-0001-0001-0001-000000000003 with phone='+33177777777'
ROLLBACK;


-- =============================================================================
-- SCENARIO 9 — Provider can insert a booking for a valid listing
-- P1 works for Owner A. Owner A owns L1.
-- INSERT booking with provider_id=P1, listing_id=L1 → should SUCCEED.
--
-- NOTE: THIS SCENARIO CURRENTLY FAILS (BUG).
-- Root cause: the bookings_insert policy references owner_listing via a subquery,
-- but providers have no SELECT access to owner_listing (policy: owner_id = auth.uid() only).
-- When the subquery runs as provider, it sees 0 rows in owner_listing and the check fails.
-- Fix: rewrite the provider path in bookings_insert to use owner_provider directly instead
-- of joining through owner_listing, or use a SECURITY DEFINER helper function.
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('22222222-0009-0009-0009-000000000001', 'L1 S9', '1 rue A', '75001', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', '22222222-0009-0009-0009-000000000001');
INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('22222222-0009-0009-0009-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T', 'S9');

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

-- Valid booking insert: provider_id=P1, listing belongs to Owner A who manages P1.
-- BUG: This currently raises ERROR 42501 because owner_listing is invisible to providers.
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee)
  VALUES ('22222222-0009-0009-0009-000000000003', '22222222-0009-0009-0009-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', '22222222-0009-0009-0009-000000000002', '2026-07-01', '2026-07-07', 'airbnb', 2, 500, 80);

SELECT COUNT(*) AS booking_inserted FROM public.bookings WHERE id = '22222222-0009-0009-0009-000000000003';
-- Expected: booking_inserted=1
-- Actual: ERROR 42501 (BUG — see note above)
ROLLBACK;


-- =============================================================================
-- SCENARIO 10 — Provider cannot insert a booking for an unauthorized listing
-- P1 works for Owner A only. Owner B owns L2.
-- INSERT booking with listing_id=L2 → RLS should reject.
--
-- NOTE: This scenario currently PASSES in terms of outcome (insert is blocked),
-- but for the wrong reason: the bookings_insert policy cannot see owner_listing
-- at all as provider, so ALL provider booking inserts are blocked (see Scenario 9).
-- Once BUG-002 is fixed, re-verify this scenario still blocks unauthorized inserts.
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('44444444-0010-0010-0010-000000000001', 'L2 S10', '2 rue B', '75002', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000002', '44444444-0010-0010-0010-000000000001');
INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('44444444-0010-0010-0010-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T', 'S10');

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

-- Unauthorized booking insert: P1 tries to insert on Owner B's listing.
-- Should raise ERROR 42501.
INSERT INTO public.bookings (listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee)
  VALUES ('44444444-0010-0010-0010-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', '44444444-0010-0010-0010-000000000002', '2026-07-01', '2026-07-07', 'airbnb', 2, 500, 80);
-- Expected: ERROR 42501
ROLLBACK;


-- =============================================================================
-- SCENARIO 11 — Provider cannot DELETE a booking; can UPDATE status=cancelled
-- P1 owns Booking B1. DELETE → 0 rows affected (silent RLS block).
-- UPDATE status=cancelled → succeeds (1 row affected).
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('55555555-0011-0011-0011-000000000001', 'L S11', '1 rue A', '75001', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', '55555555-0011-0011-0011-000000000001');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('55555555-0011-0011-0011-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T', 'S11');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('55555555-0011-0011-0011-000000000003', '55555555-0011-0011-0011-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', '55555555-0011-0011-0011-000000000002', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

-- DELETE should be blocked (0 rows affected — silent RLS filter on DELETE)
DELETE FROM public.bookings WHERE id = '55555555-0011-0011-0011-000000000003';

-- Verify the booking still exists after the DELETE attempt
SELECT COUNT(*) AS booking_still_exists FROM public.bookings WHERE id = '55555555-0011-0011-0011-000000000003';
-- Expected: booking_still_exists=1

-- UPDATE status=cancelled should succeed
UPDATE public.bookings SET status = 'cancelled' WHERE id = '55555555-0011-0011-0011-000000000003';
SELECT status FROM public.bookings WHERE id = '55555555-0011-0011-0011-000000000003';
-- Expected: status='cancelled'
ROLLBACK;


-- =============================================================================
-- SCENARIO 12 — Owner can delete a booking on their listing
-- Owner A has Booking B1 on their listing. DELETE → booking is removed (0 rows remain).
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('77777777-0012-0012-0012-000000000001', 'L S12', '1 rue A', '75001', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', '77777777-0012-0012-0012-000000000001');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('77777777-0012-0012-0012-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T', 'S12');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('77777777-0012-0012-0012-000000000003', '77777777-0012-0012-0012-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', '77777777-0012-0012-0012-000000000002', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000001"}', TRUE);

DELETE FROM public.bookings WHERE id = '77777777-0012-0012-0012-000000000003';

SELECT COUNT(*) AS booking_count FROM public.bookings WHERE id = '77777777-0012-0012-0012-000000000003';
-- Expected: booking_count=0 (booking was deleted)
ROLLBACK;


-- =============================================================================
-- SCENARIO 13 — Provider sees missions linked to their bookings
-- Owner A has M1 (used in P1's booking via booking_missions) and M2 (not linked).
-- P1 queries missions → M1 visible, M2 not.
-- =============================================================================
BEGIN;
INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('88888888-0013-0013-0013-000000000001', 'L S13', '1 rue A', '75001', 'Paris');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', '88888888-0013-0013-0013-000000000001');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('88888888-0013-0013-0013-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T', 'S13');
INSERT INTO public.missions (id, owner_id, label) VALUES
  ('88888888-0013-0013-0013-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001', 'Cleaning S13'),
  ('88888888-0013-0013-0013-000000000004', 'aaaaaaaa-0001-0001-0001-000000000001', 'Linen S13');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('88888888-0013-0013-0013-000000000005', '88888888-0013-0013-0013-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', '88888888-0013-0013-0013-000000000002', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);
INSERT INTO public.booking_missions (booking_id, mission_id) VALUES
  ('88888888-0013-0013-0013-000000000005', '88888888-0013-0013-0013-000000000003');
-- M2 is intentionally NOT linked to any booking

SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000003"}', TRUE);

SELECT
  COUNT(*)                                                                              AS total_missions,
  COUNT(*) FILTER (WHERE id = '88888888-0013-0013-0013-000000000003')                  AS sees_m1_linked,
  COUNT(*) FILTER (WHERE id = '88888888-0013-0013-0013-000000000004')                  AS sees_m2_not_linked
FROM public.missions;
-- Expected: total_missions=1, sees_m1_linked=1, sees_m2_not_linked=0
ROLLBACK;


-- =============================================================================
-- SCENARIO 14 — No user can INSERT or DELETE rows in the users table
-- INSERT → RLS raises 42501 (no INSERT policy on users).
-- DELETE → 0 rows affected (no DELETE policy on users).
-- =============================================================================

-- Part A: INSERT should raise ERROR 42501
BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000001"}', TRUE);

INSERT INTO public.users (id, type, first_name, last_name, email)
  VALUES (gen_random_uuid(), 'owner', 'Rogue', 'User', 'rogue@test.book-it');
-- Expected: ERROR 42501 (new row violates row-level security policy)
ROLLBACK;

-- Part B: DELETE should be silently blocked (run after scenario 14A fails, in its own block)
BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000001"}', TRUE);

DELETE FROM public.users WHERE id = 'aaaaaaaa-0001-0001-0001-000000000001';

SELECT COUNT(*) AS user_still_exists FROM public.users WHERE id = 'aaaaaaaa-0001-0001-0001-000000000001';
-- Expected: user_still_exists=1 (DELETE was silently blocked by absence of DELETE policy)
ROLLBACK;


-- =============================================================================
-- SCENARIO 15 — Owner cannot see listings or data of another owner
-- Owner A and Owner B each have listings, tenants, bookings, and missions.
-- Owner A queries all tables → zero rows from Owner B appear anywhere.
-- =============================================================================
BEGIN;
-- Owner A data
INSERT INTO public.listings (id, name, address, zip_code, city, note) VALUES
  ('99999999-0015-0015-0015-000000000001', 'L_A S15', '1 rue A', '75001', 'Paris', 'owner A note');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', '99999999-0015-0015-0015-000000000001');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('99999999-0015-0015-0015-000000000002', 'aaaaaaaa-0001-0001-0001-000000000001', 'T_A', 'S15');
INSERT INTO public.missions (id, owner_id, label) VALUES
  ('99999999-0015-0015-0015-000000000003', 'aaaaaaaa-0001-0001-0001-000000000001', 'Mission A S15');
INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('99999999-0015-0015-0015-000000000004', '99999999-0015-0015-0015-000000000001', 'aaaaaaaa-0001-0001-0001-000000000003', '99999999-0015-0015-0015-000000000002', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);

-- Owner B data
INSERT INTO public.listings (id, name, address, zip_code, city, note) VALUES
  ('99999999-0015-0015-0015-000000000005', 'L_B S15', '2 rue B', '75002', 'Paris', 'owner B note');
INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000002', '99999999-0015-0015-0015-000000000005');
INSERT INTO public.tenants (id, owner_id, first_name, last_name) VALUES
  ('99999999-0015-0015-0015-000000000006', 'aaaaaaaa-0001-0001-0001-000000000002', 'T_B', 'S15');
INSERT INTO public.missions (id, owner_id, label) VALUES
  ('99999999-0015-0015-0015-000000000007', 'aaaaaaaa-0001-0001-0001-000000000002', 'Mission B S15');
INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000002', 'aaaaaaaa-0001-0001-0001-000000000004');
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee) VALUES
  ('99999999-0015-0015-0015-000000000008', '99999999-0015-0015-0015-000000000005', 'aaaaaaaa-0001-0001-0001-000000000004', '99999999-0015-0015-0015-000000000006', '2026-06-01', '2026-06-07', 'airbnb', 2, 500, 80);

-- Impersonate owner A
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub": "aaaaaaaa-0001-0001-0001-000000000001"}', TRUE);

-- Check that Owner A sees ZERO rows from Owner B across all relevant tables
SELECT
  (SELECT COUNT(*) FROM public.listings     WHERE id = '99999999-0015-0015-0015-000000000005') AS b_listing,
  (SELECT COUNT(*) FROM public.tenants      WHERE id = '99999999-0015-0015-0015-000000000006') AS b_tenant,
  (SELECT COUNT(*) FROM public.missions     WHERE id = '99999999-0015-0015-0015-000000000007') AS b_mission,
  (SELECT COUNT(*) FROM public.bookings     WHERE id = '99999999-0015-0015-0015-000000000008') AS b_booking,
  (SELECT COUNT(*) FROM public.owner_listing   WHERE owner_id = 'aaaaaaaa-0001-0001-0001-000000000002') AS b_owner_listing,
  (SELECT COUNT(*) FROM public.owner_provider  WHERE owner_id = 'aaaaaaaa-0001-0001-0001-000000000002') AS b_owner_provider,
  (SELECT COUNT(*) FROM public.users           WHERE id       = 'aaaaaaaa-0001-0001-0001-000000000002') AS b_user;
-- Expected: all 7 values = 0
ROLLBACK;


-- =============================================================================
-- CLEANUP — Remove all test data created during setup
-- CASCADE on auth.users handles public.users and all downstream data.
-- =============================================================================
DELETE FROM auth.users WHERE id IN (
  'aaaaaaaa-0001-0001-0001-000000000001',
  'aaaaaaaa-0001-0001-0001-000000000002',
  'aaaaaaaa-0001-0001-0001-000000000003',
  'aaaaaaaa-0001-0001-0001-000000000004'
);
