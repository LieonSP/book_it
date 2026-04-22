-- =============================================================================
-- __tests__/extraction_rls.sql
--
-- RLS tests for Issue #74 — CSV Extraction feature.
--
-- Scenarios covered:
--   8 — Cross-owner data isolation: Owner A's CSV must not include Owner B's bookings
--   9 — Year dropdown scoped to owner: Owner A only sees their own booking years
--
-- Run with:
--   npx supabase db query --linked -f __tests__/extraction_rls.sql
--
-- Each scenario uses BEGIN / ROLLBACK to leave the DB clean.
-- We use set_config('request.jwt.claims', ...) to impersonate a user for RLS.
--
-- Pattern (per BUG-003): plain SQL BEGIN/ROLLBACK blocks only.
-- No DO $$ blocks, no PERFORM, no SAVEPOINT/ROLLBACK TO SAVEPOINT.
-- =============================================================================

-- =============================================================================
-- SCENARIO 8 — Cross-owner data isolation
--
-- Setup:
--   Owner A and Owner B each have 1 listing and 1 non-cancelled booking in May 2026.
--
-- Test:
--   When authenticated as Owner A, the bookings SELECT (RLS-filtered) returns
--   only Owner A's booking — Owner B's booking is absent.
--
-- Expected:
--   COUNT(*) = 1 (Owner A's booking only)
--   The returned booking's listing_id is Owner A's listing (not Owner B's)
-- =============================================================================

BEGIN;

-- ---- Fixture UUIDs (hardcoded for determinism) ----
-- Owner A
-- Owner B
-- Listing A
-- Listing B
-- Tenant A
-- Tenant B

-- Insert Owner A into auth.users then public.users
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  'owner_a_rls_test@example.com',
  'dummy',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, email)
VALUES ('11111111-0000-0000-0000-000000000001', 'owner', 'OwnerA', 'owner_a_rls_test@example.com')
ON CONFLICT (id) DO NOTHING;

-- Insert Owner B into auth.users then public.users
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '22222222-0000-0000-0000-000000000002',
  'owner_b_rls_test@example.com',
  'dummy',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, email)
VALUES ('22222222-0000-0000-0000-000000000002', 'owner', 'OwnerB', 'owner_b_rls_test@example.com')
ON CONFLICT (id) DO NOTHING;

-- Insert Listing A + Owner A mapping
INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES ('aaaa1111-0000-0000-0000-000000000001', 'Listing A (RLS test)', '1 rue A', '75001', 'Paris')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_listing (owner_id, listing_id)
VALUES ('11111111-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Insert Listing B + Owner B mapping
INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES ('bbbb2222-0000-0000-0000-000000000002', 'Listing B (RLS test)', '2 rue B', '69001', 'Lyon')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_listing (owner_id, listing_id)
VALUES ('22222222-0000-0000-0000-000000000002', 'bbbb2222-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- Insert Tenant A (owned by Owner A)
INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES ('cccc1111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Tenant', 'A')
ON CONFLICT (id) DO NOTHING;

-- Insert Tenant B (owned by Owner B)
INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES ('dddd2222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Tenant', 'B')
ON CONFLICT (id) DO NOTHING;

-- Insert Booking A (Owner A's listing, May 2026)
INSERT INTO public.bookings (id, listing_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee, status)
VALUES (
  'eeee1111-0000-0000-0000-000000000001',
  'aaaa1111-0000-0000-0000-000000000001',
  'cccc1111-0000-0000-0000-000000000001',
  '2026-05-01', '2026-05-04',
  'airbnb', 2, 400.00, 60.00, 'confirmed'
)
ON CONFLICT (id) DO NOTHING;

-- Insert Booking B (Owner B's listing, May 2026)
INSERT INTO public.bookings (id, listing_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee, status)
VALUES (
  'ffff2222-0000-0000-0000-000000000002',
  'bbbb2222-0000-0000-0000-000000000002',
  'dddd2222-0000-0000-0000-000000000002',
  '2026-05-10', '2026-05-13',
  'direct', 3, 600.00, 80.00, 'confirmed'
)
ON CONFLICT (id) DO NOTHING;

-- ---- Impersonate Owner A via RLS ----
SET LOCAL role = 'authenticated';
SELECT set_config(
  'request.jwt.claims',
  '{"sub": "11111111-0000-0000-0000-000000000001", "role": "authenticated"}',
  TRUE
);

-- ---- Test: Owner A sees exactly 1 booking ----
-- This mirrors the query in app/extraction/page.tsx:
--   supabase.from("bookings").select(...).neq("status","cancelled")
-- Expected: COUNT = 1 (only Booking A)

SELECT
  CASE
    WHEN COUNT(*) = 1 THEN 'SCENARIO 8 PART 1 — PASS: Owner A sees exactly 1 booking (COUNT=1)'
    ELSE 'SCENARIO 8 PART 1 — FAIL: Owner A sees ' || COUNT(*) || ' bookings (expected 1)'
  END AS result
FROM public.bookings
WHERE status != 'cancelled';

-- ---- Test: Owner A's result is Booking A (not Booking B) ----
SELECT
  CASE
    WHEN id = 'eeee1111-0000-0000-0000-000000000001'
    THEN 'SCENARIO 8 PART 2 — PASS: Owner A sees only their own booking (Booking A)'
    ELSE 'SCENARIO 8 PART 2 — FAIL: Owner A sees booking id=' || id || ' (expected Booking A)'
  END AS result
FROM public.bookings
WHERE status != 'cancelled'
LIMIT 1;

-- ---- Test: Booking B's listing_id is NOT returned for Owner A ----
SELECT
  CASE
    WHEN COUNT(*) = 0
    THEN 'SCENARIO 8 PART 3 — PASS: Booking B is not visible to Owner A (isolation confirmed)'
    ELSE 'SCENARIO 8 PART 3 — FAIL: Owner A can see ' || COUNT(*) || ' rows from Listing B (data leak!)'
  END AS result
FROM public.bookings
WHERE listing_id = 'bbbb2222-0000-0000-0000-000000000002'
  AND status != 'cancelled';

ROLLBACK;

-- =============================================================================
-- SCENARIO 9 — Year dropdown scoped to owner
--
-- Setup:
--   Owner A has bookings in 2025 and 2026.
--   Owner B has bookings in 2024 only.
--
-- Test:
--   When authenticated as Owner A, the DISTINCT check_in years returned
--   are 2025 and 2026 only — 2024 (Owner B's year) is absent.
--
-- Expected:
--   DISTINCT years = {2025, 2026} — exactly 2 rows
--   2024 does NOT appear
-- =============================================================================

BEGIN;

-- ---- Fixture setup (same auth users as Scenario 8 — recreate in this tx) ----

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  'owner_a_rls_test@example.com',
  'dummy',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, email)
VALUES ('11111111-0000-0000-0000-000000000001', 'owner', 'OwnerA', 'owner_a_rls_test@example.com')
ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES (
  '22222222-0000-0000-0000-000000000002',
  'owner_b_rls_test@example.com',
  'dummy',
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{}'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, email)
VALUES ('22222222-0000-0000-0000-000000000002', 'owner', 'OwnerB', 'owner_b_rls_test@example.com')
ON CONFLICT (id) DO NOTHING;

-- Listing A (Owner A)
INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES ('aaaa1111-0000-0000-0000-000000000001', 'Listing A (RLS test)', '1 rue A', '75001', 'Paris')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_listing (owner_id, listing_id)
VALUES ('11111111-0000-0000-0000-000000000001', 'aaaa1111-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;

-- Listing B (Owner B)
INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES ('bbbb2222-0000-0000-0000-000000000002', 'Listing B (RLS test)', '2 rue B', '69001', 'Lyon')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_listing (owner_id, listing_id)
VALUES ('22222222-0000-0000-0000-000000000002', 'bbbb2222-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

-- Tenant A (Owner A)
INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES ('cccc1111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 'Tenant', 'A')
ON CONFLICT (id) DO NOTHING;

-- Tenant B (Owner B)
INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES ('dddd2222-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000002', 'Tenant', 'B')
ON CONFLICT (id) DO NOTHING;

-- Owner A: booking in 2025
INSERT INTO public.bookings (id, listing_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee, status)
VALUES (
  'a1b21111-0000-0000-0000-000000000001',
  'aaaa1111-0000-0000-0000-000000000001',
  'cccc1111-0000-0000-0000-000000000001',
  '2025-06-01', '2025-06-05',
  'airbnb', 2, 500.00, 70.00, 'confirmed'
)
ON CONFLICT (id) DO NOTHING;

-- Owner A: booking in 2026
INSERT INTO public.bookings (id, listing_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee, status)
VALUES (
  'a1b21111-0000-0000-0000-000000000002',
  'aaaa1111-0000-0000-0000-000000000001',
  'cccc1111-0000-0000-0000-000000000001',
  '2026-03-10', '2026-03-13',
  'direct', 1, 300.00, 40.00, 'done'
)
ON CONFLICT (id) DO NOTHING;

-- Owner B: booking in 2024 (should NOT appear for Owner A)
INSERT INTO public.bookings (id, listing_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee, status)
VALUES (
  'b2c32222-0000-0000-0000-000000000003',
  'bbbb2222-0000-0000-0000-000000000002',
  'dddd2222-0000-0000-0000-000000000002',
  '2024-09-15', '2024-09-18',
  'airbnb', 3, 700.00, 90.00, 'confirmed'
)
ON CONFLICT (id) DO NOTHING;

-- ---- Impersonate Owner A ----
SET LOCAL role = 'authenticated';
SELECT set_config(
  'request.jwt.claims',
  '{"sub": "11111111-0000-0000-0000-000000000001", "role": "authenticated"}',
  TRUE
);

-- ---- Test: Owner A sees exactly 2 distinct years (2025 and 2026) ----
-- This mirrors the yearOptions derivation in page.tsx:
--   Array.from(new Set(bookings.map(b => b.check_in.slice(0, 4))))
-- At DB level: SELECT DISTINCT EXTRACT(YEAR FROM check_in) ... WHERE status != 'cancelled'

SELECT
  CASE
    WHEN COUNT(*) = 2 THEN 'SCENARIO 9 PART 1 — PASS: Owner A sees exactly 2 distinct years'
    ELSE 'SCENARIO 9 PART 1 — FAIL: Owner A sees ' || COUNT(*) || ' distinct years (expected 2)'
  END AS result
FROM (
  SELECT DISTINCT EXTRACT(YEAR FROM check_in)::text AS year
  FROM public.bookings
  WHERE status != 'cancelled'
) years;

-- ---- Test: 2025 appears in Owner A's year list ----
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN 'SCENARIO 9 PART 2 — PASS: 2025 is in Owner A''s year dropdown'
    ELSE 'SCENARIO 9 PART 2 — FAIL: 2025 is NOT in Owner A''s year dropdown'
  END AS result
FROM (
  SELECT DISTINCT EXTRACT(YEAR FROM check_in)::text AS year
  FROM public.bookings
  WHERE status != 'cancelled'
) years
WHERE year = '2025';

-- ---- Test: 2026 appears in Owner A's year list ----
SELECT
  CASE
    WHEN COUNT(*) = 1 THEN 'SCENARIO 9 PART 3 — PASS: 2026 is in Owner A''s year dropdown'
    ELSE 'SCENARIO 9 PART 3 — FAIL: 2026 is NOT in Owner A''s year dropdown'
  END AS result
FROM (
  SELECT DISTINCT EXTRACT(YEAR FROM check_in)::text AS year
  FROM public.bookings
  WHERE status != 'cancelled'
) years
WHERE year = '2026';

-- ---- Test: 2024 (Owner B only) is NOT visible to Owner A ----
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'SCENARIO 9 PART 4 — PASS: 2024 (Owner B) absent from Owner A''s year dropdown (isolation confirmed)'
    ELSE 'SCENARIO 9 PART 4 — FAIL: 2024 appears for Owner A — data leak!'
  END AS result
FROM (
  SELECT DISTINCT EXTRACT(YEAR FROM check_in)::text AS year
  FROM public.bookings
  WHERE status != 'cancelled'
) years
WHERE year = '2024';

ROLLBACK;
