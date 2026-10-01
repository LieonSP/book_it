-- ============================================================
-- Book_it — Supabase schema snapshot
-- Generated from: Supabase project (lrvpijmnujqbrehzskwe)
-- Last updated: 2026-04-16 (Issue #33)
--
-- PURPOSE: reference for Dev and QA agents writing SQL fixtures
-- or test queries. Read this before any INSERT to avoid NOT NULL
-- violations. Update when migrations are applied to dev.
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------

-- user_type: 'owner' | 'provider'
-- booking_status: 'pending' | 'confirmed' | 'done' | 'cancelled'
-- booking_source: 'airbnb' | 'direct'

-- ------------------------------------------------------------
-- TABLE: public.users
-- One row per authenticated user. id = auth.users.id (UUID).
-- No INSERT/DELETE via app — admin creates users directly.
-- ------------------------------------------------------------
-- id           uuid         NOT NULL  (FK → auth.users)
-- type         user_type    NOT NULL  ('owner' | 'provider')
-- first_name   text         NOT NULL
-- last_name    text         NULLABLE  (made nullable in migration 20260413000001)
-- phone        text         NULLABLE
-- email        text         NOT NULL
-- created_at   timestamptz  NOT NULL  DEFAULT now()

-- ------------------------------------------------------------
-- TABLE: public.listings
-- A rentable property. Linked to owners via owner_listing.
-- ------------------------------------------------------------
-- id           uuid         NOT NULL  DEFAULT gen_random_uuid()
-- name         text         NOT NULL
-- address      text         NOT NULL
-- zip_code     text         NOT NULL
-- city         text         NOT NULL
-- note         text         NULLABLE
-- created_at   timestamptz  NOT NULL  DEFAULT now()

-- ------------------------------------------------------------
-- TABLE: public.tenants
-- A guest/renter. Scoped to owner_id.
-- ------------------------------------------------------------
-- id           uuid         NOT NULL  DEFAULT gen_random_uuid()
-- owner_id     uuid         NOT NULL  (FK → users.id)
-- first_name   text         NOT NULL
-- last_name    text         NOT NULL
-- phone        text         NULLABLE
-- email        text         NULLABLE
-- note         text         NULLABLE
-- created_at   timestamptz  NOT NULL  DEFAULT now()

-- ------------------------------------------------------------
-- TABLE: public.owner_listing  (junction)
-- Maps owners to the listings they manage.
-- ------------------------------------------------------------
-- owner_id     uuid         NOT NULL  (FK → users.id)
-- listing_id   uuid         NOT NULL  (FK → listings.id)
-- PRIMARY KEY (owner_id, listing_id)

-- ------------------------------------------------------------
-- TABLE: public.owner_provider  (junction)
-- Maps owners to the service providers they work with.
-- ------------------------------------------------------------
-- owner_id     uuid         NOT NULL  (FK → users.id)
-- provider_id  uuid         NOT NULL  (FK → users.id)
-- PRIMARY KEY (owner_id, provider_id)

-- ------------------------------------------------------------
-- TABLE: public.missions
-- Task types defined per owner (cleaning, key handover, etc.)
-- ------------------------------------------------------------
-- id           uuid         NOT NULL  DEFAULT gen_random_uuid()
-- owner_id     uuid         NOT NULL  (FK → users.id)
-- label        text         NOT NULL
-- created_at   timestamptz  NOT NULL  DEFAULT now()

-- ------------------------------------------------------------
-- TABLE: public.provider_pricing
-- Agreed fee between an owner and a provider for a service.
-- UNIQUE (owner_id, provider_id, label)
-- ------------------------------------------------------------
-- id           uuid         NOT NULL  DEFAULT gen_random_uuid()
-- owner_id     uuid         NOT NULL  (FK → users.id)
-- provider_id  uuid         NOT NULL  (FK → users.id)
-- label        text         NOT NULL
-- fee          numeric(10,2) NOT NULL
-- currency     text         NOT NULL  DEFAULT 'EUR'
-- created_at   timestamptz  NOT NULL  DEFAULT now()

-- ------------------------------------------------------------
-- TABLE: public.provider_pricing_missions  (junction)
-- Links pricing rules to the missions they cover.
-- ------------------------------------------------------------
-- pricing_id   uuid         NOT NULL  (FK → provider_pricing.id)
-- mission_id   uuid         NOT NULL  (FK → missions.id)
-- PRIMARY KEY (pricing_id, mission_id)

-- ------------------------------------------------------------
-- TABLE: public.bookings
-- Core table. A stay at a listing assigned to a provider.
-- CHECK (check_out > check_in)
-- ------------------------------------------------------------
-- id             uuid         NOT NULL  DEFAULT gen_random_uuid()
-- listing_id     uuid         NOT NULL  (FK → listings.id)
-- provider_id    uuid         NULLABLE  (FK → users.id) — nullable since 20260413000000
-- tenant_id      uuid         NOT NULL  (FK → tenants.id)
-- pricing_id     uuid         NULLABLE  (FK → provider_pricing.id)
-- check_in       date         NOT NULL
-- check_in_time  time         NULLABLE
-- check_out      date         NOT NULL
-- check_out_time time         NULLABLE
-- source         booking_source NOT NULL  ('airbnb' | 'direct')
-- nb_pax         integer      NOT NULL  CHECK (nb_pax > 0)
-- rental_price   numeric(10,2) NOT NULL
-- currency       text         NOT NULL  DEFAULT 'EUR'
-- provider_fee   numeric(10,2) NOT NULL
-- status         booking_status NOT NULL  DEFAULT 'pending'
-- note           text         NULLABLE
-- created_at     timestamptz  NOT NULL  DEFAULT now()

-- ------------------------------------------------------------
-- TABLE: public.booking_missions  (junction)
-- Which missions are performed for a given booking.
-- ------------------------------------------------------------
-- booking_id   uuid         NOT NULL  (FK → bookings.id, CASCADE)
-- mission_id   uuid         NOT NULL  (FK → missions.id, RESTRICT)
-- PRIMARY KEY (booking_id, mission_id)

-- ------------------------------------------------------------
-- TRIGGER: public.trg_block_provider_fee_update
-- Added in migration 20260416000002_block_provider_fee_update.sql
-- Fires BEFORE UPDATE on public.bookings.
-- Rejects any UPDATE that changes provider_fee or pricing_id
-- when auth.uid() resolves to a user with type = 'provider'.
-- FUNCTION: public.block_provider_fee_update() SECURITY DEFINER
-- ------------------------------------------------------------

-- ============================================================
-- MINIMAL FIXTURE TEMPLATES
-- Use these as starting points for SQL test fixtures.
-- Fill in UUIDs with gen_random_uuid() or hardcoded test UUIDs.
-- ============================================================

-- INSERT INTO public.users (id, type, first_name, email)
-- VALUES ('<uuid>', 'owner', 'Alice', 'alice@test.com');

-- INSERT INTO public.listings (id, name, address, zip_code, city)
-- VALUES ('<uuid>', 'Test Listing', '1 rue Test', '75001', 'Paris');

-- INSERT INTO public.owner_listing (owner_id, listing_id)
-- VALUES ('<owner_uuid>', '<listing_uuid>');

-- INSERT INTO public.tenants (id, owner_id, first_name, last_name)
-- VALUES ('<uuid>', '<owner_uuid>', 'Jean', 'Dupont');

-- INSERT INTO public.bookings (listing_id, provider_id, tenant_id, check_in, check_out,
--   source, nb_pax, rental_price, provider_fee)
-- VALUES ('<listing_uuid>', '<provider_uuid>', '<tenant_uuid>',
--   '2026-06-01', '2026-06-07', 'airbnb', 2, 500.00, 80.00);
