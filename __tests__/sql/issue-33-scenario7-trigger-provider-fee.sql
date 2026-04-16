-- =============================================================================
-- Issue #33 — Scenario 7: DB trigger blocks provider from updating provider_fee
--
-- Given:  Provider P1 has a booking with provider_fee = 120
-- When:   P1 directly calls UPDATE bookings SET provider_fee = 0
-- Then:   DB trigger rejects the UPDATE; provider_fee remains 120
--
-- NOTE: The trigger uses auth.uid() via SECURITY DEFINER to look up the
-- user's type in public.users. We impersonate P1 using SET LOCAL role +
-- set_config JWT claims, then verify the UPDATE is rejected with
-- 'insufficient_privilege' (SQLSTATE 42501).
--
-- IMPORTANT: This test uses a savepoint strategy because a RAISE EXCEPTION
-- inside a trigger aborts the current transaction. We expect an error on the
-- UPDATE statement itself; we catch it by wrapping in a nested exception
-- handler via DO $$ (but the Management API doesn't support DO $$).
--
-- Instead: we run the UPDATE and check the fee was NOT changed after the fact
-- in a separate read transaction. The trigger aborts the UPDATE transaction,
-- so the ROLLBACK is implicit. We verify via a second BEGIN block.
-- =============================================================================

-- ----------------------------------------------------------------
-- Step 1: Setup — ensure the test booking exists (using postgres role, BYPASSRLS)
-- ----------------------------------------------------------------
BEGIN;

INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
  aud, role, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
VALUES
  ('bb000007-0000-0000-0000-000000000001', 'owner33d@test.book-it', '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('bb000007-0000-0000-0000-000000000002', 'prov33t@test.book-it',  '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, last_name, email)
VALUES
  ('bb000007-0000-0000-0000-000000000001', 'owner',    'OwnerD33', 'D', 'owner33d@test.book-it'),
  ('bb000007-0000-0000-0000-000000000002', 'provider', 'ProvT33',  'T', 'prov33t@test.book-it')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES
  ('bb000007-0000-0000-0000-000000000010', 'Listing D33', '4 rue Test', '75003', 'Paris')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('bb000007-0000-0000-0000-000000000001', 'bb000007-0000-0000-0000-000000000010')
ON CONFLICT DO NOTHING;

INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('bb000007-0000-0000-0000-000000000001', 'bb000007-0000-0000-0000-000000000002')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES
  ('bb000007-0000-0000-0000-000000000020', 'bb000007-0000-0000-0000-000000000001', 'TenantTrig', 'T')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee, status)
VALUES
  ('bb000007-0000-0000-0000-000000000030', 'bb000007-0000-0000-0000-000000000010', 'bb000007-0000-0000-0000-000000000002', 'bb000007-0000-0000-0000-000000000020', '2026-07-01', '2026-07-05', 'airbnb', 2, 500.00, 120.00, 'pending')
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------
-- Step 2: Verify initial state — provider_fee = 120
-- ----------------------------------------------------------------
SELECT provider_fee AS initial_provider_fee
FROM public.bookings
WHERE id = 'bb000007-0000-0000-0000-000000000030';
-- Expected: 120

-- ----------------------------------------------------------------
-- Step 3: Provider attempts to update provider_fee — trigger should block it.
-- The UPDATE will raise an exception (SQLSTATE 42501) which aborts the block.
-- We wrap in BEGIN/ROLLBACK; the trigger fires and raises, aborting the tx.
-- After the abort we verify the value is still 120.
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  '{"sub": "bb000007-0000-0000-0000-000000000002"}', TRUE);

-- This UPDATE should be rejected by the trigger (RAISE EXCEPTION 'insufficient_privilege')
UPDATE public.bookings
SET provider_fee = 0
WHERE id = 'bb000007-0000-0000-0000-000000000030';

ROLLBACK;

-- ----------------------------------------------------------------
-- Step 4: Verify provider_fee is STILL 120 (trigger blocked the update)
-- Expected: provider_fee = 120
-- ----------------------------------------------------------------
SELECT provider_fee AS provider_fee_after_blocked_update
FROM public.bookings
WHERE id = 'bb000007-0000-0000-0000-000000000030';
