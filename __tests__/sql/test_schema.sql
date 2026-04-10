-- =============================================================================
-- Book_it — Schema QA Test Suite
-- Migration: 20260409000000_init_schema.sql
-- Issue: #1
--
-- NOTE: These tests were written for execution against the dev Supabase project.
-- They were NOT executed — no DB connection was available at review time
-- (no DATABASE_URL, no Supabase access token, no Docker local instance).
--
-- To run: psql $DATABASE_URL -f __tests__/sql/test_schema.sql
-- Or via Supabase CLI (once linked):
--   npx supabase db query --db-url "$DATABASE_URL" < __tests__/sql/test_schema.sql
--
-- IMPORTANT LIMITATION — auth.users FK:
-- public.users.id references auth.users(id). Direct SQL inserts into public.users
-- will fail unless the auth user already exists, because the FK is NOT DEFERRABLE.
-- Scenarios 5–13 (which need a real users.id) require either:
--   a) A service_role JWT to insert via Supabase Auth API first, OR
--   b) A known pre-existing auth user UUID in the dev project.
-- The tests below use a placeholder UUID 'aaaaaaaa-0000-0000-0000-000000000001'
-- for the owner and 'aaaaaaaa-0000-0000-0000-000000000002' for the provider.
-- These UUIDs must exist in auth.users for scenarios 5–13 to pass.
-- Scenarios 1–4 and 14 do not require auth users.
-- =============================================================================

-- Placeholder UUIDs — replace with real auth.users UUIDs before executing
-- (or pre-insert them via the Supabase Auth API / dashboard)
-- \set owner_id  'aaaaaaaa-0000-0000-0000-000000000001'
-- \set provider_id 'aaaaaaaa-0000-0000-0000-000000000002'


-- =============================================================================
-- Scenario 1: All 10 expected tables exist in the public schema
-- =============================================================================
DO $$
DECLARE
  v_count INTEGER;
  v_expected_tables TEXT[] := ARRAY[
    'users', 'listings', 'tenants', 'owner_listing', 'owner_provider',
    'missions', 'provider_pricing', 'provider_pricing_missions',
    'bookings', 'booking_missions'
  ];
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name = ANY(v_expected_tables)
    AND table_type = 'BASE TABLE';

  IF v_count < 10 THEN
    RAISE EXCEPTION 'Expected 10 tables, found %', v_count;
  END IF;

  RAISE NOTICE 'Scenario 1: PASS — all 10 tables present (found %)', v_count;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 1: FAIL — %', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 2: booking_status enum rejects invalid values
-- =============================================================================
DO $$
DECLARE
  v_caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    -- Attempt to cast an invalid value to booking_status
    PERFORM 'invalid_value'::booking_status;
  EXCEPTION WHEN invalid_text_representation OR others THEN
    v_caught := TRUE;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'booking_status accepted "invalid_value" — enum not enforced';
  END IF;

  RAISE NOTICE 'Scenario 2: PASS — booking_status enum rejects invalid values';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 2: FAIL — %', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 3: booking_source enum rejects 'booking.com'
-- =============================================================================
DO $$
DECLARE
  v_caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM 'booking.com'::booking_source;
  EXCEPTION WHEN invalid_text_representation OR others THEN
    v_caught := TRUE;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'booking_source accepted "booking.com" — enum not enforced';
  END IF;

  RAISE NOTICE 'Scenario 3: PASS — booking_source enum rejects "booking.com"';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 3: FAIL — %', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 4: user_type enum rejects 'admin'
-- =============================================================================
DO $$
DECLARE
  v_caught BOOLEAN := FALSE;
BEGIN
  BEGIN
    PERFORM 'admin'::user_type;
  EXCEPTION WHEN invalid_text_representation OR others THEN
    v_caught := TRUE;
  END;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'user_type accepted "admin" — enum not enforced';
  END IF;

  RAISE NOTICE 'Scenario 4: PASS — user_type enum rejects "admin"';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 4: FAIL — %', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 5: CHECK (nb_pax > 0) rejects nb_pax = 0
-- NOTE: Requires owner_id, provider_id, listing_id, tenant_id to exist.
--       Uses placeholder UUIDs — will fail with FK error if auth users don't exist.
--       If you get a FK error on users.id rather than a check constraint error,
--       the test is BLOCKED (not FAIL) — see file header for workaround.
-- =============================================================================
DO $$
DECLARE
  v_owner_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_listing_id  UUID;
  v_tenant_id   UUID;
  v_caught      BOOLEAN := FALSE;
BEGIN
  -- Setup: insert a listing (no FK to users)
  INSERT INTO listings (id, name, address, zip_code, city)
  VALUES (gen_random_uuid(), 'Test Listing S5', '1 rue Test', '75001', 'Paris')
  RETURNING id INTO v_listing_id;

  -- Setup: insert a tenant (FK to users — requires v_owner_id in auth.users)
  INSERT INTO tenants (id, owner_id, first_name, last_name)
  VALUES (gen_random_uuid(), v_owner_id, 'Test', 'Tenant')
  RETURNING id INTO v_tenant_id;

  -- Action: try to insert a booking with nb_pax = 0
  BEGIN
    INSERT INTO bookings (
      listing_id, provider_id, tenant_id, check_in, check_out,
      source, nb_pax, rental_price, provider_fee
    ) VALUES (
      v_listing_id, v_provider_id, v_tenant_id,
      '2026-06-01', '2026-06-07',
      'airbnb', 0, 500.00, 80.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := TRUE;
  END;

  -- Cleanup (best-effort — runs even if test fails)
  DELETE FROM tenants WHERE id = v_tenant_id;
  DELETE FROM listings WHERE id = v_listing_id;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'nb_pax = 0 was accepted — CHECK constraint not enforced';
  END IF;

  RAISE NOTICE 'Scenario 5: PASS — CHECK (nb_pax > 0) enforced';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 5: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 6: CHECK (check_out > check_in) rejects equal dates
-- NOTE: Same auth.users FK prerequisite as Scenario 5.
-- =============================================================================
DO $$
DECLARE
  v_owner_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_listing_id  UUID;
  v_tenant_id   UUID;
  v_caught      BOOLEAN := FALSE;
BEGIN
  INSERT INTO listings (id, name, address, zip_code, city)
  VALUES (gen_random_uuid(), 'Test Listing S6', '1 rue Test', '75001', 'Paris')
  RETURNING id INTO v_listing_id;

  INSERT INTO tenants (id, owner_id, first_name, last_name)
  VALUES (gen_random_uuid(), v_owner_id, 'Test', 'Tenant6')
  RETURNING id INTO v_tenant_id;

  BEGIN
    INSERT INTO bookings (
      listing_id, provider_id, tenant_id, check_in, check_out,
      source, nb_pax, rental_price, provider_fee
    ) VALUES (
      v_listing_id, v_provider_id, v_tenant_id,
      '2026-06-01', '2026-06-01',  -- same date: check_out = check_in
      'airbnb', 2, 500.00, 80.00
    );
  EXCEPTION WHEN check_violation THEN
    v_caught := TRUE;
  END;

  DELETE FROM tenants WHERE id = v_tenant_id;
  DELETE FROM listings WHERE id = v_listing_id;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'check_out = check_in was accepted — CHECK constraint not enforced';
  END IF;

  RAISE NOTICE 'Scenario 6: PASS — CHECK (check_out > check_in) enforced';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 6: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 7: Duplicate (booking_id, mission_id) in booking_missions blocked
-- NOTE: Same auth.users FK prerequisite.
-- =============================================================================
DO $$
DECLARE
  v_owner_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_listing_id  UUID;
  v_tenant_id   UUID;
  v_booking_id  UUID;
  v_mission_id  UUID;
  v_caught      BOOLEAN := FALSE;
BEGIN
  INSERT INTO listings (id, name, address, zip_code, city)
  VALUES (gen_random_uuid(), 'Test Listing S7', '1 rue Test', '75001', 'Paris')
  RETURNING id INTO v_listing_id;

  INSERT INTO tenants (id, owner_id, first_name, last_name)
  VALUES (gen_random_uuid(), v_owner_id, 'Test', 'Tenant7')
  RETURNING id INTO v_tenant_id;

  INSERT INTO bookings (
    listing_id, provider_id, tenant_id, check_in, check_out,
    source, nb_pax, rental_price, provider_fee
  ) VALUES (
    v_listing_id, v_provider_id, v_tenant_id,
    '2026-06-01', '2026-06-07',
    'airbnb', 2, 500.00, 80.00
  ) RETURNING id INTO v_booking_id;

  INSERT INTO missions (id, owner_id, label)
  VALUES (gen_random_uuid(), v_owner_id, 'Cleaning S7')
  RETURNING id INTO v_mission_id;

  -- First insert — should succeed
  INSERT INTO booking_missions (booking_id, mission_id)
  VALUES (v_booking_id, v_mission_id);

  -- Second insert — should fail with PK violation
  BEGIN
    INSERT INTO booking_missions (booking_id, mission_id)
    VALUES (v_booking_id, v_mission_id);
  EXCEPTION WHEN unique_violation THEN
    v_caught := TRUE;
  END;

  -- Cleanup
  DELETE FROM booking_missions WHERE booking_id = v_booking_id;
  DELETE FROM bookings WHERE id = v_booking_id;
  DELETE FROM missions WHERE id = v_mission_id;
  DELETE FROM tenants WHERE id = v_tenant_id;
  DELETE FROM listings WHERE id = v_listing_id;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'Duplicate booking_mission was accepted — composite PK not enforced';
  END IF;

  RAISE NOTICE 'Scenario 7: PASS — composite PK on booking_missions enforced';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 7: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 8: Duplicate (pricing_id, mission_id) in provider_pricing_missions blocked
-- NOTE: Same auth.users FK prerequisite.
-- =============================================================================
DO $$
DECLARE
  v_owner_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_pricing_id  UUID;
  v_mission_id  UUID;
  v_caught      BOOLEAN := FALSE;
BEGIN
  INSERT INTO provider_pricing (id, owner_id, provider_id, label, fee)
  VALUES (gen_random_uuid(), v_owner_id, v_provider_id, 'Preset S8', 80.00)
  RETURNING id INTO v_pricing_id;

  INSERT INTO missions (id, owner_id, label)
  VALUES (gen_random_uuid(), v_owner_id, 'Cleaning S8')
  RETURNING id INTO v_mission_id;

  -- First insert — should succeed
  INSERT INTO provider_pricing_missions (pricing_id, mission_id)
  VALUES (v_pricing_id, v_mission_id);

  -- Second insert — should fail with PK violation
  BEGIN
    INSERT INTO provider_pricing_missions (pricing_id, mission_id)
    VALUES (v_pricing_id, v_mission_id);
  EXCEPTION WHEN unique_violation THEN
    v_caught := TRUE;
  END;

  -- Cleanup
  DELETE FROM provider_pricing_missions WHERE pricing_id = v_pricing_id;
  DELETE FROM provider_pricing WHERE id = v_pricing_id;
  DELETE FROM missions WHERE id = v_mission_id;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'Duplicate pricing_mission was accepted — composite PK not enforced';
  END IF;

  RAISE NOTICE 'Scenario 8: PASS — composite PK on provider_pricing_missions enforced';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 8: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 9: UNIQUE (owner_id, provider_id, label) on provider_pricing enforced
-- NOTE: Same auth.users FK prerequisite.
-- =============================================================================
DO $$
DECLARE
  v_owner_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_p1_id       UUID;
  v_caught      BOOLEAN := FALSE;
BEGIN
  INSERT INTO provider_pricing (id, owner_id, provider_id, label, fee)
  VALUES (gen_random_uuid(), v_owner_id, v_provider_id, 'Duplicate Label', 80.00)
  RETURNING id INTO v_p1_id;

  BEGIN
    INSERT INTO provider_pricing (id, owner_id, provider_id, label, fee)
    VALUES (gen_random_uuid(), v_owner_id, v_provider_id, 'Duplicate Label', 90.00);
  EXCEPTION WHEN unique_violation THEN
    v_caught := TRUE;
  END;

  -- Cleanup
  DELETE FROM provider_pricing WHERE id = v_p1_id;
  -- Also clean the second row if it somehow got in
  DELETE FROM provider_pricing
  WHERE owner_id = v_owner_id AND provider_id = v_provider_id AND label = 'Duplicate Label';

  IF NOT v_caught THEN
    RAISE EXCEPTION 'Duplicate (owner_id, provider_id, label) accepted — UNIQUE constraint not enforced';
  END IF;

  RAISE NOTICE 'Scenario 9: PASS — UNIQUE (owner_id, provider_id, label) on provider_pricing enforced';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 9: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 10: FK on bookings.tenant_id rejects nonexistent tenant
-- NOTE: Requires v_listing_id and v_provider_id to exist; only tenant_id is fake.
-- =============================================================================
DO $$
DECLARE
  v_owner_id       UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_listing_id     UUID;
  v_fake_tenant_id UUID := 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  v_caught         BOOLEAN := FALSE;
BEGIN
  INSERT INTO listings (id, name, address, zip_code, city)
  VALUES (gen_random_uuid(), 'Test Listing S10', '1 rue Test', '75001', 'Paris')
  RETURNING id INTO v_listing_id;

  BEGIN
    INSERT INTO bookings (
      listing_id, provider_id, tenant_id, check_in, check_out,
      source, nb_pax, rental_price, provider_fee
    ) VALUES (
      v_listing_id, v_provider_id, v_fake_tenant_id,
      '2026-06-01', '2026-06-07',
      'airbnb', 2, 500.00, 80.00
    );
  EXCEPTION WHEN foreign_key_violation THEN
    v_caught := TRUE;
  END;

  DELETE FROM listings WHERE id = v_listing_id;

  IF NOT v_caught THEN
    RAISE EXCEPTION 'Nonexistent tenant_id was accepted — FK not enforced';
  END IF;

  RAISE NOTICE 'Scenario 10: PASS — FK on bookings.tenant_id enforced';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 10: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 11: Manual fee (pricing_id = NULL) accepted
-- NOTE: Same auth.users FK prerequisite.
-- =============================================================================
DO $$
DECLARE
  v_owner_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_listing_id  UUID;
  v_tenant_id   UUID;
  v_booking_id  UUID;
BEGIN
  INSERT INTO listings (id, name, address, zip_code, city)
  VALUES (gen_random_uuid(), 'Test Listing S11', '1 rue Test', '75001', 'Paris')
  RETURNING id INTO v_listing_id;

  INSERT INTO tenants (id, owner_id, first_name, last_name)
  VALUES (gen_random_uuid(), v_owner_id, 'Test', 'Tenant11')
  RETURNING id INTO v_tenant_id;

  -- pricing_id is NULL (manual fee)
  INSERT INTO bookings (
    listing_id, provider_id, tenant_id, pricing_id, check_in, check_out,
    source, nb_pax, rental_price, provider_fee
  ) VALUES (
    v_listing_id, v_provider_id, v_tenant_id, NULL,
    '2026-06-01', '2026-06-07',
    'direct', 2, 400.00, 65.00
  ) RETURNING id INTO v_booking_id;

  -- Verify pricing_id is indeed NULL
  IF NOT EXISTS (
    SELECT 1 FROM bookings WHERE id = v_booking_id AND pricing_id IS NULL
  ) THEN
    RAISE EXCEPTION 'pricing_id was not NULL after insert';
  END IF;

  -- Cleanup
  DELETE FROM bookings WHERE id = v_booking_id;
  DELETE FROM tenants WHERE id = v_tenant_id;
  DELETE FROM listings WHERE id = v_listing_id;

  RAISE NOTICE 'Scenario 11: PASS — booking with pricing_id = NULL accepted';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 11: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 12: provider_fee snapshot is independent of pricing preset changes
-- NOTE: Same auth.users FK prerequisite.
-- =============================================================================
DO $$
DECLARE
  v_owner_id      UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id   UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_listing_id    UUID;
  v_tenant_id     UUID;
  v_pricing_id    UUID;
  v_booking_id    UUID;
  v_original_fee  NUMERIC(10, 2) := 80.00;
  v_stored_fee    NUMERIC(10, 2);
BEGIN
  INSERT INTO listings (id, name, address, zip_code, city)
  VALUES (gen_random_uuid(), 'Test Listing S12', '1 rue Test', '75001', 'Paris')
  RETURNING id INTO v_listing_id;

  INSERT INTO tenants (id, owner_id, first_name, last_name)
  VALUES (gen_random_uuid(), v_owner_id, 'Test', 'Tenant12')
  RETURNING id INTO v_tenant_id;

  INSERT INTO provider_pricing (id, owner_id, provider_id, label, fee)
  VALUES (gen_random_uuid(), v_owner_id, v_provider_id, 'Preset S12', v_original_fee)
  RETURNING id INTO v_pricing_id;

  INSERT INTO bookings (
    listing_id, provider_id, tenant_id, pricing_id, check_in, check_out,
    source, nb_pax, rental_price, provider_fee
  ) VALUES (
    v_listing_id, v_provider_id, v_tenant_id, v_pricing_id,
    '2026-06-01', '2026-06-07',
    'airbnb', 2, 500.00, v_original_fee
  ) RETURNING id INTO v_booking_id;

  -- Change the preset fee — booking should NOT be affected
  UPDATE provider_pricing SET fee = 999.00 WHERE id = v_pricing_id;

  SELECT provider_fee INTO v_stored_fee FROM bookings WHERE id = v_booking_id;

  -- Cleanup
  DELETE FROM bookings WHERE id = v_booking_id;
  DELETE FROM provider_pricing WHERE id = v_pricing_id;
  DELETE FROM tenants WHERE id = v_tenant_id;
  DELETE FROM listings WHERE id = v_listing_id;

  IF v_stored_fee <> v_original_fee THEN
    RAISE EXCEPTION 'provider_fee changed after preset update: expected %, got %',
      v_original_fee, v_stored_fee;
  END IF;

  RAISE NOTICE 'Scenario 12: PASS — provider_fee snapshot unaffected by preset change (fee still %)', v_stored_fee;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 12: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 13: Full happy path — complete data chain
-- NOTE: Same auth.users FK prerequisite.
-- =============================================================================
DO $$
DECLARE
  v_owner_id    UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  v_provider_id UUID := 'aaaaaaaa-0000-0000-0000-000000000002';
  v_listing_id  UUID;
  v_tenant_id   UUID;
  v_mission_id  UUID;
  v_pricing_id  UUID;
  v_booking_id  UUID;
BEGIN
  -- Listing
  INSERT INTO listings (id, name, address, zip_code, city)
  VALUES (gen_random_uuid(), 'Happy Path Listing', '10 rue Exemple', '69001', 'Lyon')
  RETURNING id INTO v_listing_id;

  -- Owner-listing join
  INSERT INTO owner_listing (owner_id, listing_id)
  VALUES (v_owner_id, v_listing_id);

  -- Owner-provider join
  INSERT INTO owner_provider (owner_id, provider_id)
  VALUES (v_owner_id, v_provider_id);

  -- Tenant
  INSERT INTO tenants (id, owner_id, first_name, last_name, email)
  VALUES (gen_random_uuid(), v_owner_id, 'Jean', 'Dupont', 'jean@dupont.fr')
  RETURNING id INTO v_tenant_id;

  -- Mission
  INSERT INTO missions (id, owner_id, label)
  VALUES (gen_random_uuid(), v_owner_id, 'Nettoyage complet')
  RETURNING id INTO v_mission_id;

  -- Pricing preset
  INSERT INTO provider_pricing (id, owner_id, provider_id, label, fee, currency)
  VALUES (gen_random_uuid(), v_owner_id, v_provider_id, 'Forfait standard', 85.00, 'EUR')
  RETURNING id INTO v_pricing_id;

  -- Link mission to pricing preset
  INSERT INTO provider_pricing_missions (pricing_id, mission_id)
  VALUES (v_pricing_id, v_mission_id);

  -- Booking
  INSERT INTO bookings (
    listing_id, provider_id, tenant_id, pricing_id,
    check_in, check_out, source, nb_pax,
    rental_price, currency, provider_fee, status
  ) VALUES (
    v_listing_id, v_provider_id, v_tenant_id, v_pricing_id,
    '2026-07-01', '2026-07-07', 'airbnb', 3,
    750.00, 'EUR', 85.00, 'confirmed'
  ) RETURNING id INTO v_booking_id;

  -- Link mission to booking
  INSERT INTO booking_missions (booking_id, mission_id)
  VALUES (v_booking_id, v_mission_id);

  -- Verify booking exists with expected defaults
  IF NOT EXISTS (
    SELECT 1 FROM bookings
    WHERE id = v_booking_id
      AND currency = 'EUR'
      AND status = 'confirmed'
      AND pricing_id = v_pricing_id
  ) THEN
    RAISE EXCEPTION 'Happy path booking verification failed';
  END IF;

  -- Cleanup (reverse dependency order)
  DELETE FROM booking_missions WHERE booking_id = v_booking_id;
  DELETE FROM bookings WHERE id = v_booking_id;
  DELETE FROM provider_pricing_missions WHERE pricing_id = v_pricing_id;
  DELETE FROM provider_pricing WHERE id = v_pricing_id;
  DELETE FROM missions WHERE id = v_mission_id;
  DELETE FROM tenants WHERE id = v_tenant_id;
  DELETE FROM owner_provider WHERE owner_id = v_owner_id AND provider_id = v_provider_id;
  DELETE FROM owner_listing WHERE owner_id = v_owner_id AND listing_id = v_listing_id;
  DELETE FROM listings WHERE id = v_listing_id;

  RAISE NOTICE 'Scenario 13: PASS — full happy path chain inserted and verified';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 13: FAIL — % (may be BLOCKED if FK on auth.users fails)', SQLERRM;
END;
$$;


-- =============================================================================
-- Scenario 14: DOWN migration DROP statements execute cleanly (wrapped in
-- a transaction that is immediately rolled back — schema is preserved)
-- =============================================================================
DO $$
BEGIN
  -- The DOWN migration is commented out in the migration file. We replicate it
  -- here inside a savepoint so the actual schema is never altered.
  BEGIN
    -- We use a subtransaction (SAVEPOINT) to isolate the drops and roll them back
    SAVEPOINT down_migration_test;

    DROP TABLE IF EXISTS booking_missions;
    DROP TABLE IF EXISTS bookings;
    DROP TABLE IF EXISTS provider_pricing_missions;
    DROP TABLE IF EXISTS provider_pricing;
    DROP TABLE IF EXISTS missions;
    DROP TABLE IF EXISTS owner_provider;
    DROP TABLE IF EXISTS owner_listing;
    DROP TABLE IF EXISTS tenants;
    DROP TABLE IF EXISTS listings;
    DROP TABLE IF EXISTS users;
    DROP TYPE IF EXISTS booking_source;
    DROP TYPE IF EXISTS booking_status;
    DROP TYPE IF EXISTS user_type;

    -- If we got here, all DROPs succeeded — now roll back so nothing is lost
    ROLLBACK TO SAVEPOINT down_migration_test;

  END;

  RAISE NOTICE 'Scenario 14: PASS — DOWN migration DROP statements executed without error (rolled back)';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'Scenario 14: FAIL — %', SQLERRM;
END;
$$;
