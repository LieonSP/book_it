-- Scenario 4 — RLS blocks provider from reading unrelated listings
--
-- Setup:
--   Provider A = a0000000-0000-0000-0000-000000000002 (linked to Owner 1 only)
--   We create an unrelated owner + listing and confirm Provider A sees 0 rows for it.
--
-- The listings_select policy allows a provider to see a listing only if:
--   EXISTS (bookings where provider_id = auth.uid() AND listing_id = listings.id)
-- Provider A has no bookings → they can only see listings they have bookings for.
--
-- This query verifies that Provider A cannot read listings belonging to a completely
-- unrelated owner (no owner_provider link, no existing bookings).

BEGIN;

-- Create an unrelated owner and listing
INSERT INTO auth.users (id, email) VALUES
  ('f1000000-0000-0000-0000-000000000002', 'owner2_sc4_test@example.com');

INSERT INTO public.users (id, type, first_name, email) VALUES
  ('f1000000-0000-0000-0000-000000000002', 'owner', 'OwnerSC4', 'owner2_sc4_test@example.com');

INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('f2000000-0000-0000-0000-000000000002', 'Hidden Listing SC4', '1 Rue Test', '75001', 'Paris');

INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('f1000000-0000-0000-0000-000000000002', 'f2000000-0000-0000-0000-000000000002');

-- Switch to Provider A's session
SET LOCAL role = 'authenticated';
SELECT set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', TRUE);

-- Provider A must not see the unrelated listing
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 'PASS: unrelated listing is invisible to Provider A'
    ELSE 'FAIL: Provider A can see unrelated listing — RLS breach!'
  END AS result
FROM public.listings
WHERE id = 'f2000000-0000-0000-0000-000000000002';

ROLLBACK;
