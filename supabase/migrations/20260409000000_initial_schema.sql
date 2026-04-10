-- ============================================================
-- UP
-- Initial schema for Book_it
-- Creates all enums, tables, and constraints needed for v0.
-- ============================================================

-- ------------------------------------------------------------
-- ENUMS
-- Enums restrict a column to a fixed set of allowed values,
-- preventing typos and making the data model self-documenting.
-- ------------------------------------------------------------

-- user_type distinguishes between property owners (who manage
-- listings and providers) and service providers (who execute
-- bookings / missions).
CREATE TYPE public.user_type AS ENUM ('owner', 'provider');

-- booking_status tracks the lifecycle of a booking from creation
-- to completion or cancellation.
CREATE TYPE public.booking_status AS ENUM (
  'pending',    -- created but not yet confirmed
  'confirmed',  -- confirmed by both parties
  'done',       -- service has been completed
  'cancelled'   -- booking was cancelled
);

-- booking_source records where the booking originated, so owners
-- can distinguish Airbnb reservations from direct bookings.
CREATE TYPE public.booking_source AS ENUM ('airbnb', 'direct');


-- ------------------------------------------------------------
-- TABLE: users
-- Extends Supabase Auth's auth.users with business profile data.
-- Every authenticated user has exactly one row here.
-- The id is the same UUID as in auth.users — no separate key.
-- ------------------------------------------------------------
CREATE TABLE public.users (
  id          UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  type        public.user_type  NOT NULL,
  first_name  TEXT        NOT NULL,
  last_name   TEXT        NOT NULL,
  phone       TEXT,
  email       TEXT        NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.users IS
  'Business profile for every authenticated user. '
  'Mirrors auth.users with role and contact info added.';


-- ------------------------------------------------------------
-- TABLE: listings
-- A listing is a physical property (apartment, house, etc.)
-- managed by one or more owners. Listings are not directly
-- owned here — ownership is expressed via the owner_listing
-- junction table below, allowing shared ownership in the future.
-- ------------------------------------------------------------
CREATE TABLE public.listings (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  address    TEXT        NOT NULL,
  zip_code   TEXT        NOT NULL,
  city       TEXT        NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.listings IS
  'A rentable property (apartment, villa, etc.). '
  'Linked to owners through owner_listing.';


-- ------------------------------------------------------------
-- TABLE: tenants
-- A tenant is a guest associated with a booking.
-- Tenants belong to an owner (owner_id) so that owner-scoped
-- RLS policies can restrict visibility — an owner only sees
-- tenants they created.
-- ------------------------------------------------------------
CREATE TABLE public.tenants (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  first_name TEXT        NOT NULL,
  last_name  TEXT        NOT NULL,
  phone      TEXT,
  email      TEXT,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenants IS
  'Guests / renters. Scoped to the owner who created them '
  'so they remain invisible to other owners.';


-- ------------------------------------------------------------
-- TABLE: owner_listing (junction)
-- Maps owners to the listings they manage.
-- A composite primary key prevents duplicate associations.
-- This design allows a listing to be shared between owners
-- (or transferred later) without schema changes.
-- ------------------------------------------------------------
CREATE TABLE public.owner_listing (
  owner_id   UUID NOT NULL REFERENCES public.users(id)    ON DELETE CASCADE,
  listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
  PRIMARY KEY (owner_id, listing_id)
);

COMMENT ON TABLE public.owner_listing IS
  'Many-to-many: which owners manage which listings.';


-- ------------------------------------------------------------
-- TABLE: owner_provider (junction)
-- Maps owners to the service providers they work with.
-- An owner can only assign bookings to providers they have
-- a relationship with — this table enforces that boundary.
-- ------------------------------------------------------------
CREATE TABLE public.owner_provider (
  owner_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  PRIMARY KEY (owner_id, provider_id)
);

COMMENT ON TABLE public.owner_provider IS
  'Many-to-many: which service providers work for which owners.';


-- ------------------------------------------------------------
-- TABLE: missions
-- A mission is a type of task a provider can perform
-- (e.g. "cleaning", "linen change", "check-in greeting").
-- Missions are defined per owner so each owner can customise
-- their own catalogue without affecting others.
-- ------------------------------------------------------------
CREATE TABLE public.missions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID        NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  label      TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.missions IS
  'Catalogue of task types defined by an owner '
  '(e.g. cleaning, key handover). Used to tag bookings.';


-- ------------------------------------------------------------
-- TABLE: provider_pricing
-- Stores the agreed fee between an owner and a provider
-- for a given service label.
-- The UNIQUE constraint on (owner_id, provider_id, label)
-- prevents duplicate pricing rows for the same combination.
-- ------------------------------------------------------------
CREATE TABLE public.provider_pricing (
  id          UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID           NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  provider_id UUID           NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  label       TEXT           NOT NULL,
  fee         NUMERIC(10,2)  NOT NULL,
  currency    TEXT           NOT NULL DEFAULT 'EUR',
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (owner_id, provider_id, label)
);

COMMENT ON TABLE public.provider_pricing IS
  'Agreed fee for a provider''s service, scoped to an owner. '
  'Used to pre-fill the provider_fee on bookings.';


-- ------------------------------------------------------------
-- TABLE: provider_pricing_missions (junction)
-- Links a pricing rule to the specific missions it covers.
-- A single pricing item can apply to multiple mission types.
-- ------------------------------------------------------------
CREATE TABLE public.provider_pricing_missions (
  pricing_id UUID NOT NULL REFERENCES public.provider_pricing(id) ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id)         ON DELETE CASCADE,
  PRIMARY KEY (pricing_id, mission_id)
);

COMMENT ON TABLE public.provider_pricing_missions IS
  'Many-to-many: which missions are included in a pricing rule.';


-- ------------------------------------------------------------
-- TABLE: bookings
-- Core table of the application. A booking represents a stay
-- at a listing, with a tenant, managed by a provider.
-- - pricing_id is nullable because the fee may be entered
--   manually rather than pulled from a pricing rule.
-- - provider_fee is stored directly (denormalised) so historical
--   records are not affected if pricing rules change later.
-- - The CHECK (check_out > check_in) constraint prevents
--   logically impossible date ranges at the database level.
-- ------------------------------------------------------------
CREATE TABLE public.bookings (
  id            UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id    UUID           NOT NULL REFERENCES public.listings(id)  ON DELETE RESTRICT,
  provider_id   UUID           NOT NULL REFERENCES public.users(id)     ON DELETE RESTRICT,
  tenant_id     UUID           NOT NULL REFERENCES public.tenants(id)   ON DELETE RESTRICT,
  pricing_id    UUID               REFERENCES public.provider_pricing(id) ON DELETE SET NULL,
  check_in      DATE           NOT NULL,
  check_in_time TIME,
  check_out     DATE           NOT NULL,
  check_out_time TIME,
  source        public.booking_source   NOT NULL,
  nb_pax        INTEGER        NOT NULL CHECK (nb_pax > 0),
  rental_price  NUMERIC(10,2)  NOT NULL,
  currency      TEXT           NOT NULL DEFAULT 'EUR',
  provider_fee  NUMERIC(10,2)  NOT NULL,
  status        public.booking_status NOT NULL DEFAULT 'pending',
  note          TEXT,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CHECK (check_out > check_in)
);

COMMENT ON TABLE public.bookings IS
  'A guest stay at a listing, assigned to a service provider. '
  'Central entity that ties listings, tenants, providers, and missions together.';


-- ------------------------------------------------------------
-- TABLE: booking_missions (junction)
-- Records which missions are associated with a booking.
-- For example, a booking might include "cleaning" + "linen".
-- ------------------------------------------------------------
CREATE TABLE public.booking_missions (
  booking_id UUID NOT NULL REFERENCES public.bookings(id)  ON DELETE CASCADE,
  mission_id UUID NOT NULL REFERENCES public.missions(id)  ON DELETE RESTRICT,
  PRIMARY KEY (booking_id, mission_id)
);

COMMENT ON TABLE public.booking_missions IS
  'Many-to-many: which missions are performed for a given booking.';


-- ============================================================
-- DOWN
-- Drops everything created above in strict reverse dependency
-- order. Run this only when you need to completely wipe the
-- schema (e.g. during local development or a failed migration).
--
-- IMPORTANT: The DROP statements below are intentionally commented
-- out. They are here for documentation and manual rollback only.
-- Supabase runs this entire file as the UP migration — leaving
-- the DROPs uncommented would destroy the schema right after
-- creating it. Uncomment and run manually when a rollback is needed.
-- ============================================================

-- DROP TABLE IF EXISTS public.booking_missions         CASCADE;
-- DROP TABLE IF EXISTS public.bookings                 CASCADE;
-- DROP TABLE IF EXISTS public.provider_pricing_missions CASCADE;
-- DROP TABLE IF EXISTS public.provider_pricing         CASCADE;
-- DROP TABLE IF EXISTS public.missions                 CASCADE;
-- DROP TABLE IF EXISTS public.owner_provider           CASCADE;
-- DROP TABLE IF EXISTS public.owner_listing            CASCADE;
-- DROP TABLE IF EXISTS public.tenants                  CASCADE;
-- DROP TABLE IF EXISTS public.listings                 CASCADE;
-- DROP TABLE IF EXISTS public.users                    CASCADE;

-- DROP TYPE IF EXISTS public.booking_source  CASCADE;
-- DROP TYPE IF EXISTS public.booking_status  CASCADE;
-- DROP TYPE IF EXISTS public.user_type       CASCADE;
