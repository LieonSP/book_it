-- =============================================================================
-- Issue #33 — Scenario 2: Provider sees only their own bookings in the list
--
-- Given:  Provider P1 has 1 booking; Provider P2 has 1 booking on same listing
-- When:   Provider P1 queries bookings (as authenticated user)
-- Then:   Only P1's booking is returned; P2's booking is invisible
-- =============================================================================

BEGIN;

-- Auth users
INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
  aud, role, created_at, updated_at, confirmation_token, recovery_token,
  email_change_token_new, email_change)
VALUES
  ('bb000002-0000-0000-0000-000000000001', 'owner33c@test.book-it', '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('bb000002-0000-0000-0000-000000000002', 'prov33p1@test.book-it', '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', ''),
  ('bb000002-0000-0000-0000-000000000003', 'prov33p2@test.book-it', '{}', '{}', 'authenticated', 'authenticated', now(), now(), '', '', '', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.users (id, type, first_name, last_name, email)
VALUES
  ('bb000002-0000-0000-0000-000000000001', 'owner',    'OwnerC33', 'C',  'owner33c@test.book-it'),
  ('bb000002-0000-0000-0000-000000000002', 'provider', 'Prov33P1', 'P1', 'prov33p1@test.book-it'),
  ('bb000002-0000-0000-0000-000000000003', 'provider', 'Prov33P2', 'P2', 'prov33p2@test.book-it')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.listings (id, name, address, zip_code, city)
VALUES
  ('bb000002-0000-0000-0000-000000000010', 'Listing C33', '3 rue Test', '75002', 'Paris')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('bb000002-0000-0000-0000-000000000001', 'bb000002-0000-0000-0000-000000000010')
ON CONFLICT DO NOTHING;

INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('bb000002-0000-0000-0000-000000000001', 'bb000002-0000-0000-0000-000000000002'),
  ('bb000002-0000-0000-0000-000000000001', 'bb000002-0000-0000-0000-000000000003')
ON CONFLICT DO NOTHING;

INSERT INTO public.tenants (id, owner_id, first_name, last_name)
VALUES
  ('bb000002-0000-0000-0000-000000000020', 'bb000002-0000-0000-0000-000000000001', 'TenantP1', 'X'),
  ('bb000002-0000-0000-0000-000000000021', 'bb000002-0000-0000-0000-000000000001', 'TenantP2', 'Y')
ON CONFLICT (id) DO NOTHING;

-- P1's booking and P2's booking on the same listing
INSERT INTO public.bookings (id, listing_id, provider_id, tenant_id, check_in, check_out, source, nb_pax, rental_price, provider_fee)
VALUES
  ('bb000002-0000-0000-0000-000000000030', 'bb000002-0000-0000-0000-000000000010', 'bb000002-0000-0000-0000-000000000002', 'bb000002-0000-0000-0000-000000000020', '2026-06-01', '2026-06-05', 'airbnb', 2, 400.00, 60.00),
  ('bb000002-0000-0000-0000-000000000031', 'bb000002-0000-0000-0000-000000000010', 'bb000002-0000-0000-0000-000000000003', 'bb000002-0000-0000-0000-000000000021', '2026-06-10', '2026-06-14', 'direct', 1, 350.00, 50.00)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ----------------------------------------------------------------
-- Test: Provider P1 sees only their booking, NOT P2's
-- Expected: booking_count = 1, p2_booking_visible = 0
-- ----------------------------------------------------------------
BEGIN;
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims',
  '{"sub": "bb000002-0000-0000-0000-000000000002"}', TRUE);

SELECT
  COUNT(*)                                                                    AS booking_count,
  COUNT(*) FILTER (WHERE id = 'bb000002-0000-0000-0000-000000000031')         AS p2_booking_visible
FROM public.bookings;
-- Expected: booking_count = 1, p2_booking_visible = 0

ROLLBACK;
