-- Scenario 3 — RLS blocks provider from inserting a booking on an unrelated listing
--
-- Setup:
--   Provider A = a0000000-0000-0000-0000-000000000002 (linked to Owner 1)
--   Owner 2    = a0000000-0000-0000-0000-000000000001 owns listings b0000000-...-0001..0004
--   We need a listing owned by a DIFFERENT owner than the one Provider A works for.
--
-- Since all current listings belong to Owner 1 and Provider A is linked to Owner 1,
-- we create a temporary owner + listing to represent "unrelated" data.
--
-- Expected: the INSERT is blocked by the bookings_insert WITH CHECK policy
-- (provider_can_access_listing returns FALSE for an unrelated listing).

BEGIN;

-- Create an isolated owner and listing that Provider A has no relationship with
INSERT INTO auth.users (id, email) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'owner2_rls_test@example.com');

INSERT INTO public.users (id, type, first_name, email) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'owner', 'Owner2Test', 'owner2_rls_test@example.com');

INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('f2000000-0000-0000-0000-000000000001', 'Unrelated Listing RLS Test', '2 Rue Test', '75002', 'Paris');

INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('f1000000-0000-0000-0000-000000000001', 'f2000000-0000-0000-0000-000000000001');

-- Insert the tenant as superuser (bypassing RLS) so we can test bookings_insert alone.
-- The tenant belongs to the unrelated owner (f1..001).
INSERT INTO public.tenants (id, owner_id, first_name, last_name, email) VALUES
  ('f3000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', 'Tenant', 'Test', 'tenant_sc3@example.com');

-- NOW switch to Provider A's session to attempt the booking INSERT
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', TRUE);

-- Attempt to INSERT a booking on the unrelated listing
-- Expected: ERROR 42501 — RLS blocks it (provider_can_access_listing returns FALSE)
INSERT INTO public.bookings (
  listing_id, provider_id, tenant_id,
  check_in, check_out, source, nb_pax, rental_price, provider_fee
) VALUES (
  'f2000000-0000-0000-0000-000000000001',   -- unrelated listing
  'a0000000-0000-0000-0000-000000000002',   -- Provider A
  'f3000000-0000-0000-0000-000000000001',
  '2026-07-01', '2026-07-05', 'direct', 2, 300, 50
);

ROLLBACK;
