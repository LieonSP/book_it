-- ============================================================
-- Book_it — Development Seed
-- Safe to re-run after `supabase db reset`.
--
-- IDEMPOTENCY STRATEGY
-- --------------------
-- Static reference data (users, listings, missions, pricing):
--   INSERT ... ON CONFLICT (id) DO NOTHING
--   → already-inserted rows are left untouched; no error on re-run.
--
-- Transactional data (tenants, bookings, booking_missions):
--   DELETE by owner scope, then re-insert.
--   This guarantees a clean slate for volatile data while preserving
--   reference data that other parts of the app might depend on.
--   Deletion order follows FK dependency: booking_missions →
--   bookings → tenants.
--
-- UUIDs are hardcoded so every environment (local, staging, prod)
-- uses the same identifiers — making cross-env debugging trivial.
-- ============================================================


-- ============================================================
-- SECTION 1 — AUTH USERS
-- Insert into auth.users first; public.users FKs to auth.users.
-- crypt() with gen_salt('bf') produces bcrypt hashes that Supabase
-- Auth recognises for email/password login.
-- ============================================================

-- Anne So — owner
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  role, aud, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'anneso@book-it.app',
  crypt('Welcome2026!', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Alana — provider
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  role, aud, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  'a0000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000000',
  'alana@book-it.app',
  crypt('Welcome2026!', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Norah — provider
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  role, aud, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  'a0000000-0000-0000-0000-000000000003',
  '00000000-0000-0000-0000-000000000000',
  'norah@book-it.app',
  crypt('Welcome2026!', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Jeanne — provider
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  role, aud, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  'a0000000-0000-0000-0000-000000000004',
  '00000000-0000-0000-0000-000000000000',
  'jeanne@book-it.app',
  crypt('Welcome2026!', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;

-- Chloé — provider
INSERT INTO auth.users (
  id, instance_id, email, encrypted_password, email_confirmed_at,
  role, aud, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
) VALUES (
  'a0000000-0000-0000-0000-000000000005',
  '00000000-0000-0000-0000-000000000000',
  'chloe@book-it.app',
  crypt('Welcome2026!', gen_salt('bf')),
  now(), 'authenticated', 'authenticated',
  '{"provider":"email","providers":["email"]}', '{}',
  now(), now(), '', '', '', ''
) ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 2 — PUBLIC USERS
-- Business profiles. last_name is now nullable (migration 20260413000001).
-- ============================================================

INSERT INTO public.users (id, type, first_name, last_name, email) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'owner',    'Anne So', NULL,    'anneso@book-it.app'),
  ('a0000000-0000-0000-0000-000000000002', 'provider', 'Alana',   NULL,    'alana@book-it.app'),
  ('a0000000-0000-0000-0000-000000000003', 'provider', 'Norah',   NULL,    'norah@book-it.app'),
  ('a0000000-0000-0000-0000-000000000004', 'provider', 'Jeanne',  NULL,    'jeanne@book-it.app'),
  ('a0000000-0000-0000-0000-000000000005', 'provider', 'Chloé',   NULL,    'chloe@book-it.app')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 3 — LISTINGS
-- Addresses are placeholders to be filled before production.
-- ============================================================

INSERT INTO public.listings (id, name, address, zip_code, city) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'RDC',     'Adresse à compléter', '00000', 'Ville à compléter'),
  ('b0000000-0000-0000-0000-000000000002', 'R+1',     'Adresse à compléter', '00000', 'Ville à compléter'),
  ('b0000000-0000-0000-0000-000000000003', 'Duplex',  'Adresse à compléter', '00000', 'Ville à compléter'),
  ('b0000000-0000-0000-0000-000000000004', 'Lacanau', 'Adresse à compléter', '00000', 'Ville à compléter')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 4 — OWNER ↔ LISTING
-- Link Anne So to all four listings she manages.
-- ============================================================

INSERT INTO public.owner_listing (owner_id, listing_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000004')
ON CONFLICT (owner_id, listing_id) DO NOTHING;


-- ============================================================
-- SECTION 5 — OWNER ↔ PROVIDER
-- Link Anne So to all four providers she works with.
-- ============================================================

INSERT INTO public.owner_provider (owner_id, provider_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004'),
  ('a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005')
ON CONFLICT (owner_id, provider_id) DO NOTHING;


-- ============================================================
-- SECTION 6 — MISSIONS
-- Anne So's mission catalogue. Only one mission in v0 seed.
-- ============================================================

INSERT INTO public.missions (id, owner_id, label) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Ménage avant CI')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 7 — PROVIDER PRICING PRESETS
-- One preset per provider, all for the same mission type.
-- Fee is 20.00 EUR — agreed rate for "Ménage avant CI".
-- ============================================================

INSERT INTO public.provider_pricing (id, owner_id, provider_id, label, fee, currency) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'Ménage avant CI', 20.00, 'EUR'),
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'Ménage avant CI', 20.00, 'EUR'),
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'Ménage avant CI', 20.00, 'EUR'),
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'Ménage avant CI', 20.00, 'EUR')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- SECTION 8 — PROVIDER PRICING ↔ MISSIONS
-- Link each pricing preset to the "Ménage avant CI" mission.
-- ============================================================

INSERT INTO public.provider_pricing_missions (pricing_id, mission_id) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000001')
ON CONFLICT (pricing_id, mission_id) DO NOTHING;


-- ============================================================
-- SECTION 9 — CLEAN TRANSACTIONAL DATA (idempotency)
-- Delete all volatile data scoped to Anne So before re-inserting.
-- Order matters: FK chain is booking_missions → bookings → tenants.
-- ============================================================

DELETE FROM public.booking_missions
WHERE booking_id IN (
  SELECT b.id
  FROM public.bookings b
  WHERE b.listing_id IN (
    SELECT ol.listing_id
    FROM public.owner_listing ol
    WHERE ol.owner_id = 'a0000000-0000-0000-0000-000000000001'
  )
);

DELETE FROM public.bookings
WHERE listing_id IN (
  SELECT ol.listing_id
  FROM public.owner_listing ol
  WHERE ol.owner_id = 'a0000000-0000-0000-0000-000000000001'
);

DELETE FROM public.tenants
WHERE owner_id = 'a0000000-0000-0000-0000-000000000001';


-- ============================================================
-- SECTION 10 — TENANTS
-- One tenant per booking. Name splitting: last word = last_name,
-- everything before = first_name.
-- All tenants are owned by Anne So.
-- ============================================================
-- Mapping UUIDs: tenant IDs follow booking order (e0000000...000NNN)
-- for easy cross-referencing during debugging.

INSERT INTO public.tenants (id, owner_id, first_name, last_name, phone) VALUES
  -- #1  Victoria Louise Webb
  ('e0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Victoria Louise', 'Webb',              '001 (206) 834-5193'),
  -- #2  Eider Hipolito Etxeberria
  ('e0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Eider Hipolito',  'Etxeberria',        '0034 688 72 61 15'),
  -- #3  David Fourrier
  ('e0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'David',           'Fourrier',          NULL),
  -- #4  James Doherty
  ('e0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', 'James',           'Doherty',           '0044 7710 533869'),
  -- #5  potes Sigo
  ('e0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000001', 'potes',           'Sigo',              NULL),
  -- #6  Moustaffa Ait Ouaret
  ('e0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', 'Moustaffa Ait',   'Ouaret',            '0033 7 80 35 62 89'),
  -- #7  Hannah Radermacher
  ('e0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Hannah',          'Radermacher',       '0049 176 81144737'),
  -- #8  Juan Palma
  ('e0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', 'Juan',            'Palma',             '001 727-312-8146'),
  -- #9  Hugo Schwartzwalder
  ('e0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'Hugo',            'Schwartzwalder',    '0033 7 85 84 23 13'),
  -- #10 Cristina Moyano Barahona
  ('e0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', 'Cristina Moyano', 'Barahona',          '0056 9 9979 8736'),
  -- #11 Alexis Hill
  ('e0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000001', 'Alexis',          'Hill',              '0044 7540 553810'),
  -- #12 Steffie Saincir
  ('e0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'Steffie',         'Saincir',           '0033 6 16 71 30 04'),
  -- #13 Megan Jenness-Cauvy
  ('e0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000001', 'Megan',           'Jenness-Cauvy',     '0033 6 66 28 19 43'),
  -- #14 Marlesa Gray
  ('e0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'Marlesa',         'Gray',              '001 520-668-3368'),
  -- #15 Brigitte et Francis Corbel
  ('e0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000001', 'Brigitte et Francis', 'Corbel',        '0033 608008002'),
  -- #16 Lauren Snowden Lambert
  ('e0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000001', 'Lauren Snowden',  'Lambert',           '0044 7595 405248'),
  -- #17 Tineke Van Vulpen
  ('e0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000001', 'Tineke Van',      'Vulpen',            '0031 6 23112360'),
  -- #18 Yoan Herades
  ('e0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000001', 'Yoan',            'Herades',           '0033 7 60 22 40 31'),
  -- #19 Sue Des
  ('e0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000001', 'Sue',             'Des',               '001 905-716-8576'),
  -- #20 Simon Peter Toal
  ('e0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000001', 'Simon Peter',     'Toal',              '00353 86 313 3339'),
  -- #21 Madison Cornelius
  ('e0000000-0000-0000-0000-000000000021', 'a0000000-0000-0000-0000-000000000001', 'Madison',         'Cornelius',         '001 714-609-0805'),
  -- #22 James Murphy
  ('e0000000-0000-0000-0000-000000000022', 'a0000000-0000-0000-0000-000000000001', 'James',           'Murphy',            '001 773-220-8766'),
  -- #23 Paulo Fernandes
  ('e0000000-0000-0000-0000-000000000023', 'a0000000-0000-0000-0000-000000000001', 'Paulo',           'Fernandes',         '0055 21 98011-0387'),
  -- #24 Rita Phu
  ('e0000000-0000-0000-0000-000000000024', 'a0000000-0000-0000-0000-000000000001', 'Rita',            'Phu',               '0061 431 717 080'),
  -- #25 Berit Finnström
  ('e0000000-0000-0000-0000-000000000025', 'a0000000-0000-0000-0000-000000000001', 'Berit',           'Finnström',         '0046 70 815 52 63'),
  -- #26 Julio Montoya Silva
  ('e0000000-0000-0000-0000-000000000026', 'a0000000-0000-0000-0000-000000000001', 'Julio Montoya',   'Silva',             '0057 311 5746111'),
  -- #27 Jason Parliament
  ('e0000000-0000-0000-0000-000000000027', 'a0000000-0000-0000-0000-000000000001', 'Jason',           'Parliament',        '001 613-720-6833'),
  -- #28 Julia Erica
  ('e0000000-0000-0000-0000-000000000028', 'a0000000-0000-0000-0000-000000000001', 'Julia',           'Erica',             '001 905-466-5559'),
  -- #29 Michael Leu
  ('e0000000-0000-0000-0000-000000000029', 'a0000000-0000-0000-0000-000000000001', 'Michael',         'Leu',               '0049 160 97552275'),
  -- #30 Jana Schuster
  ('e0000000-0000-0000-0000-000000000030', 'a0000000-0000-0000-0000-000000000001', 'Jana',            'Schuster',          '0049 160 95511138'),
  -- #31 Julie Shakeshaft
  ('e0000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000001', 'Julie',           'Shakeshaft',        '0044 7854 765672'),
  -- #32 Dan Mulligan
  ('e0000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000001', 'Dan',             'Mulligan',          '001 604-842-1267'),
  -- #33 Caroline Chiron
  ('e0000000-0000-0000-0000-000000000033', 'a0000000-0000-0000-0000-000000000001', 'Caroline',        'Chiron',            '0033 6 70 56 33 96'),
  -- #34 Linda & Gandert Pelger
  ('e0000000-0000-0000-0000-000000000034', 'a0000000-0000-0000-0000-000000000001', 'Linda & Gandert', 'Pelger',            '0031 6 20504831'),
  -- #35 Patri Talaveron Cuesta
  ('e0000000-0000-0000-0000-000000000035', 'a0000000-0000-0000-0000-000000000001', 'Patri Talaveron', 'Cuesta',            '0034 647 43 19 66'),
  -- #36 Josh Fourez
  ('e0000000-0000-0000-0000-000000000036', 'a0000000-0000-0000-0000-000000000001', 'Josh',            'Fourez',            '0061 414 148 745'),
  -- #37 Aurélie Soula
  ('e0000000-0000-0000-0000-000000000037', 'a0000000-0000-0000-0000-000000000001', 'Aurélie',         'Soula',             '0033 6 63 27 80 28'),
  -- #38 Rory Lynch
  ('e0000000-0000-0000-0000-000000000038', 'a0000000-0000-0000-0000-000000000001', 'Rory',            'Lynch',             '0044 7392 868178'),
  -- #39 Andrew Rooke
  ('e0000000-0000-0000-0000-000000000039', 'a0000000-0000-0000-0000-000000000001', 'Andrew',          'Rooke',             '0044 7734 470231'),
  -- #40 Varrie Scullion
  ('e0000000-0000-0000-0000-000000000040', 'a0000000-0000-0000-0000-000000000001', 'Varrie',          'Scullion',          '0044 7484 287213'),
  -- #41 Nadine Becker
  ('e0000000-0000-0000-0000-000000000041', 'a0000000-0000-0000-0000-000000000001', 'Nadine',          'Becker',            '0049 176 30621399'),
  -- #42 Mélanie Menard
  ('e0000000-0000-0000-0000-000000000042', 'a0000000-0000-0000-0000-000000000001', 'Mélanie',         'Menard',            '0033 7 88 43 26 48'),
  -- #43 Iris Zwartbol
  ('e0000000-0000-0000-0000-000000000043', 'a0000000-0000-0000-0000-000000000001', 'Iris',            'Zwartbol',          '0031 6 27823008'),
  -- #44 Lewis Bird
  ('e0000000-0000-0000-0000-000000000044', 'a0000000-0000-0000-0000-000000000001', 'Lewis',           'Bird',              '0044 7949 442278'),
  -- #45 Keagan Wallace
  ('e0000000-0000-0000-0000-000000000045', 'a0000000-0000-0000-0000-000000000001', 'Keagan',          'Wallace',           '001 780-904-5324'),
  -- #46 Sally Bamford
  ('e0000000-0000-0000-0000-000000000046', 'a0000000-0000-0000-0000-000000000001', 'Sally',           'Bamford',           '0044 7895 475583'),
  -- #47 Elizabeth Joy
  ('e0000000-0000-0000-0000-000000000047', 'a0000000-0000-0000-0000-000000000001', 'Elizabeth',       'Joy',               '0061 407 875 187'),
  -- #48 Lily Carpenter
  ('e0000000-0000-0000-0000-000000000048', 'a0000000-0000-0000-0000-000000000001', 'Lily',            'Carpenter',         '0061 492 836 025'),
  -- #49 Maria Cervantes
  ('e0000000-0000-0000-0000-000000000049', 'a0000000-0000-0000-0000-000000000001', 'Maria',           'Cervantes',         '0052 81 1545 0777'),
  -- #50 Jael Beek
  ('e0000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000001', 'Jael',            'Beek',              '0031 6 40775873'),
  -- #51 Marie-Andrée Balthazar
  ('e0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000001', 'Marie-Andrée',    'Balthazar',         '001 514-503-2603'),
  -- #52 Ian Brown
  ('e0000000-0000-0000-0000-000000000052', 'a0000000-0000-0000-0000-000000000001', 'Ian',             'Brown',             '0044 7779 003946'),
  -- #53 Clara-Lu Gebhard
  ('e0000000-0000-0000-0000-000000000053', 'a0000000-0000-0000-0000-000000000001', 'Clara-Lu',        'Gebhard',           '0049 1577 1881201'),
  -- #54 Berangere Cauvin
  ('e0000000-0000-0000-0000-000000000054', 'a0000000-0000-0000-0000-000000000001', 'Berangere',       'Cauvin',            '0033 6 71 71 21 21'),
  -- #55 Katherine Macnaughton
  ('e0000000-0000-0000-0000-000000000055', 'a0000000-0000-0000-0000-000000000001', 'Katherine',       'Macnaughton',       '001 514-812-7499'),
  -- #56 Bernd Adam
  ('e0000000-0000-0000-0000-000000000056', 'a0000000-0000-0000-0000-000000000001', 'Bernd',           'Adam',              '0049 1511 5218898'),
  -- #57 Theodora Ewer
  ('e0000000-0000-0000-0000-000000000057', 'a0000000-0000-0000-0000-000000000001', 'Theodora',        'Ewer',              '0044 7875 638606'),
  -- #58 Maia Souillot
  ('e0000000-0000-0000-0000-000000000058', 'a0000000-0000-0000-0000-000000000001', 'Maia',            'Souillot',          '0033 6 83 35 60 40'),
  -- #59 Faye Kennedy
  ('e0000000-0000-0000-0000-000000000059', 'a0000000-0000-0000-0000-000000000001', 'Faye',            'Kennedy',           '0044 7930 177905'),
  -- #60 Agnès Journiac
  ('e0000000-0000-0000-0000-000000000060', 'a0000000-0000-0000-0000-000000000001', 'Agnès',           'Journiac',          '0033 6 68 45 90 16'),
  -- #61 Verena We
  ('e0000000-0000-0000-0000-000000000061', 'a0000000-0000-0000-0000-000000000001', 'Verena',          'We',                '0049 176 63830696'),
  -- #62 Bruce Reed
  ('e0000000-0000-0000-0000-000000000062', 'a0000000-0000-0000-0000-000000000001', 'Bruce',           'Reed',              '0061 428 448 795'),
  -- #63 Tanja Suchy
  ('e0000000-0000-0000-0000-000000000063', 'a0000000-0000-0000-0000-000000000001', 'Tanja',           'Suchy',             '0049 173 5803587'),
  -- #64 Jessica Sonnenberg
  ('e0000000-0000-0000-0000-000000000064', 'a0000000-0000-0000-0000-000000000001', 'Jessica',         'Sonnenberg',        '0049 176 97918926'),
  -- #65 Bernd Wollenburg
  ('e0000000-0000-0000-0000-000000000065', 'a0000000-0000-0000-0000-000000000001', 'Bernd',           'Wollenburg',        '0049 174 9778062'),
  -- #66 Peter Löw
  ('e0000000-0000-0000-0000-000000000066', 'a0000000-0000-0000-0000-000000000001', 'Peter',           'Löw',               '0049 174 2108376'),
  -- #67 Stefan Kröger
  ('e0000000-0000-0000-0000-000000000067', 'a0000000-0000-0000-0000-000000000001', 'Stefan',          'Kröger',            '0049 160 99851581'),
  -- #68 Sharon Easton
  ('e0000000-0000-0000-0000-000000000068', 'a0000000-0000-0000-0000-000000000001', 'Sharon',          'Easton',            '0044 7910 937448'),
  -- #69 Jenny Stringer
  ('e0000000-0000-0000-0000-000000000069', 'a0000000-0000-0000-0000-000000000001', 'Jenny',           'Stringer',          '0044 7887 804465');


-- ============================================================
-- SECTION 11 — BOOKINGS
-- All 69 bookings. FK columns:
--   listing_id  → b0000000-...-000{1-4}
--   provider_id → a0000000-...-000{2-5} or NULL (nullable since migration 20260413000000)
--   tenant_id   → e0000000-...-000{01-69}
--
-- provider_fee: 20.00 for bookings with a provider; 0.00 as the
-- sentinel value for no-provider bookings (column is NOT NULL per schema).
--
-- NOTE on overlapping bookings #67 and #68 on RDC: the database
-- has no overlap constraint, so both are inserted as-is.
-- NOTE on booking #21 (Madison Cornelius): dates are in 2025 — this
-- is intentional (historical booking), satisfies check_out > check_in.
-- ============================================================

INSERT INTO public.bookings (
  id, listing_id, provider_id, tenant_id, check_in, check_in_time, check_out, check_out_time,
  source, nb_pax, rental_price, currency, provider_fee, status, note
) VALUES

-- #1 R+1 — Victoria Louise Webb — no provider (long-term stay)
( 'f0000000-0000-0000-0000-000000000001',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000001',
  '2026-01-01', NULL, '2026-05-15', NULL,
  'direct', 1, 8200.00, 'EUR', 0.00, 'confirmed', NULL ),

-- #2 RDC — Eider Hipolito Etxeberria — Alana
( 'f0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002',
  '2026-01-02', NULL, '2026-01-06', NULL,
  'airbnb', 2, 346.29, 'EUR', 20.00, 'confirmed', NULL ),

-- #3 RDC — David Fourrier — no provider
( 'f0000000-0000-0000-0000-000000000003',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000003',
  '2026-01-15', NULL, '2026-01-18', NULL,
  'airbnb', 2, 267.28, 'EUR', 0.00, 'confirmed', NULL ),

-- #4 RDC — James Doherty — no provider
( 'f0000000-0000-0000-0000-000000000004',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000004',
  '2026-01-20', NULL, '2026-01-23', NULL,
  'airbnb', 1, 267.28, 'EUR', 0.00, 'confirmed', NULL ),

-- #5 RDC — potes Sigo — no provider
( 'f0000000-0000-0000-0000-000000000005',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000005',
  '2026-01-24', NULL, '2026-01-26', NULL,
  'direct', 2, 150.00, 'EUR', 0.00, 'confirmed', NULL ),

-- #6 RDC — Moustaffa Ait Ouaret — no provider
( 'f0000000-0000-0000-0000-000000000006',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000006',
  '2026-01-27', NULL, '2026-01-29', NULL,
  'airbnb', 1, 196.04, 'EUR', 0.00, 'confirmed', NULL ),

-- #7 RDC — Hannah Radermacher — no provider
( 'f0000000-0000-0000-0000-000000000007',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000007',
  '2026-01-30', NULL, '2026-02-04', NULL,
  'airbnb', 1, 434.16, 'EUR', 0.00, 'confirmed', NULL ),

-- #8 RDC — Juan Palma — no provider
( 'f0000000-0000-0000-0000-000000000008',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000008',
  '2026-02-07', NULL, '2026-02-10', NULL,
  'airbnb', 2, 267.15, 'EUR', 0.00, 'confirmed', 'lit bébé' ),

-- #9 RDC — Hugo Schwartzwalder — no provider
( 'f0000000-0000-0000-0000-000000000009',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000009',
  '2026-02-12', NULL, '2026-02-15', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #10 RDC — Cristina Moyano Barahona — Norah
( 'f0000000-0000-0000-0000-000000000010',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000010',
  '2026-02-15', NULL, '2026-02-19', NULL,
  'airbnb', 2, 347.46, 'EUR', 20.00, 'confirmed', NULL ),

-- #11 RDC — Alexis Hill — Alana
( 'f0000000-0000-0000-0000-000000000011',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000011',
  '2026-02-20', NULL, '2026-02-25', NULL,
  'airbnb', 1, 422.92, 'EUR', 20.00, 'confirmed', NULL ),

-- #12 RDC — Steffie Saincir — no provider
( 'f0000000-0000-0000-0000-000000000012',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000012',
  '2026-02-25', NULL, '2026-02-28', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #13 RDC — Megan Jenness-Cauvy — no provider
( 'f0000000-0000-0000-0000-000000000013',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000013',
  '2026-02-28', NULL, '2026-03-05', NULL,
  'airbnb', 1, 422.92, 'EUR', 0.00, 'confirmed', NULL ),

-- #14 RDC — Marlesa Gray — no provider
( 'f0000000-0000-0000-0000-000000000014',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000014',
  '2026-03-07', NULL, '2026-03-17', NULL,
  'airbnb', 2, 779.45, 'EUR', 0.00, 'confirmed', NULL ),

-- #15 RDC — Brigitte et Francis Corbel — no provider
( 'f0000000-0000-0000-0000-000000000015',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000015',
  '2026-03-17', NULL, '2026-03-20', NULL,
  'direct', 2, 300.00, 'EUR', 0.00, 'confirmed', NULL ),

-- #16 RDC — Lauren Snowden Lambert — no provider
( 'f0000000-0000-0000-0000-000000000016',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000016',
  '2026-03-20', NULL, '2026-03-23', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #17 RDC — Tineke Van Vulpen — no provider — has check_in_time/check_out_time
( 'f0000000-0000-0000-0000-000000000017',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000017',
  '2026-03-25', '16:30', '2026-03-29', '10:30',
  'airbnb', 2, 346.29, 'EUR', 0.00, 'confirmed', NULL ),

-- #18 RDC — Yoan Herades — no provider
( 'f0000000-0000-0000-0000-000000000018',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000018',
  '2026-03-29', NULL, '2026-04-02', NULL,
  'airbnb', 2, 346.29, 'EUR', 0.00, 'confirmed', NULL ),

-- #19 RDC — Sue Des — Jeanne
( 'f0000000-0000-0000-0000-000000000019',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000019',
  '2026-04-02', NULL, '2026-04-07', NULL,
  'airbnb', 2, 422.92, 'EUR', 20.00, 'confirmed', NULL ),

-- #20 RDC — Simon Peter Toal — Chloé — has check_in_time/check_out_time
( 'f0000000-0000-0000-0000-000000000020',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000020',
  '2026-04-07', '14:00', '2026-04-10', '07:00',
  'airbnb', 2, 267.15, 'EUR', 20.00, 'confirmed', NULL ),

-- #21 RDC — Madison Cornelius — Norah — historical booking (2025 dates, as-is per spec)
( 'f0000000-0000-0000-0000-000000000021',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000021',
  '2025-04-11', NULL, '2025-04-15', NULL,
  'airbnb', 2, 346.29, 'EUR', 20.00, 'confirmed', NULL ),

-- #22 Duplex — James Murphy — no provider
( 'f0000000-0000-0000-0000-000000000022',
  'b0000000-0000-0000-0000-000000000003', NULL, 'e0000000-0000-0000-0000-000000000022',
  '2026-04-09', NULL, '2026-04-14', NULL,
  'airbnb', 4, 1343.55, 'EUR', 0.00, 'confirmed', NULL ),

-- #23 RDC — Paulo Fernandes — Chloé
( 'f0000000-0000-0000-0000-000000000023',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000023',
  '2026-04-15', NULL, '2026-04-18', NULL,
  'airbnb', 2, 265.58, 'EUR', 20.00, 'confirmed', NULL ),

-- #24 RDC — Rita Phu — Chloé
( 'f0000000-0000-0000-0000-000000000024',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000024',
  '2026-04-18', NULL, '2026-04-21', NULL,
  'airbnb', 2, 267.75, 'EUR', 20.00, 'confirmed', NULL ),

-- #25 RDC — Berit Finnström — no provider
( 'f0000000-0000-0000-0000-000000000025',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000025',
  '2026-04-22', NULL, '2026-04-25', NULL,
  'airbnb', 2, 267.15, 'EUR', 0.00, 'confirmed', NULL ),

-- #26 RDC — Julio Montoya Silva — Chloé
( 'f0000000-0000-0000-0000-000000000026',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000026',
  '2026-04-25', NULL, '2026-04-28', NULL,
  'airbnb', 2, 265.58, 'EUR', 20.00, 'confirmed', 'lit bébé' ),

-- #27 RDC — Jason Parliament — no provider
( 'f0000000-0000-0000-0000-000000000027',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000027',
  '2026-04-29', NULL, '2026-05-04', NULL,
  'airbnb', 2, 425.42, 'EUR', 0.00, 'confirmed', NULL ),

-- #28 RDC — Julia Erica — no provider
( 'f0000000-0000-0000-0000-000000000028',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000028',
  '2026-05-05', NULL, '2026-05-10', NULL,
  'airbnb', 2, 422.92, 'EUR', 0.00, 'confirmed', 'lit bébé' ),

-- #29 RDC — Michael Leu — Chloé — late check-in
( 'f0000000-0000-0000-0000-000000000029',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000029',
  '2026-05-10', '22:00', '2026-05-15', NULL,
  'airbnb', 2, 425.42, 'EUR', 20.00, 'confirmed', NULL ),

-- #30 R+1 — Jana Schuster — no provider
( 'f0000000-0000-0000-0000-000000000030',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000030',
  '2026-05-15', NULL, '2026-05-19', NULL,
  'airbnb', 1, 344.25, 'EUR', 0.00, 'confirmed', NULL ),

-- #31 RDC — Julie Shakeshaft — Jeanne
( 'f0000000-0000-0000-0000-000000000031',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000031',
  '2026-05-15', NULL, '2026-05-18', NULL,
  'airbnb', 2, 267.16, 'EUR', 20.00, 'confirmed', NULL ),

-- #32 RDC — Dan Mulligan — no provider
( 'f0000000-0000-0000-0000-000000000032',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000032',
  '2026-05-18', NULL, '2026-05-25', NULL,
  'airbnb', 2, 554.54, 'EUR', 0.00, 'confirmed', NULL ),

-- #33 R+1 — Caroline Chiron — no provider
( 'f0000000-0000-0000-0000-000000000033',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000033',
  '2026-05-19', NULL, '2026-05-22', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #34 Duplex — Linda & Gandert Pelger — no provider
( 'f0000000-0000-0000-0000-000000000034',
  'b0000000-0000-0000-0000-000000000003', NULL, 'e0000000-0000-0000-0000-000000000034',
  '2026-05-22', NULL, '2026-05-25', NULL,
  'airbnb', 4, 983.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #35 R+1 — Patri Talaveron Cuesta — no provider
( 'f0000000-0000-0000-0000-000000000035',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000035',
  '2026-05-23', NULL, '2026-05-26', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #36 RDC — Josh Fourez — Jeanne
( 'f0000000-0000-0000-0000-000000000036',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000036',
  '2026-05-25', NULL, '2026-05-28', NULL,
  'airbnb', 2, 267.16, 'EUR', 20.00, 'confirmed', NULL ),

-- #37 R+1 — Aurélie Soula — no provider — has check_in_time
( 'f0000000-0000-0000-0000-000000000037',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000037',
  '2026-05-27', '15:00', '2026-05-30', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #38 RDC — Rory Lynch — no provider — late check-in
( 'f0000000-0000-0000-0000-000000000038',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000038',
  '2026-05-28', '20:00', '2026-05-31', NULL,
  'airbnb', 2, 267.15, 'EUR', 0.00, 'confirmed', NULL ),

-- #39 RDC — Andrew Rooke — no provider
( 'f0000000-0000-0000-0000-000000000039',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000039',
  '2026-06-01', NULL, '2026-06-04', NULL,
  'airbnb', 2, 267.16, 'EUR', 0.00, 'confirmed', NULL ),

-- #40 RDC — Varrie Scullion — no provider
( 'f0000000-0000-0000-0000-000000000040',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000040',
  '2026-06-04', NULL, '2026-06-07', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #41 RDC — Nadine Becker — Jeanne
( 'f0000000-0000-0000-0000-000000000041',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000041',
  '2026-06-07', NULL, '2026-06-10', NULL,
  'airbnb', 2, 267.99, 'EUR', 20.00, 'confirmed', NULL ),

-- #42 RDC — Mélanie Menard — no provider
( 'f0000000-0000-0000-0000-000000000042',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000042',
  '2026-06-11', NULL, '2026-06-14', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #43 R+1 — Iris Zwartbol — no provider
( 'f0000000-0000-0000-0000-000000000043',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000043',
  '2026-06-11', NULL, '2026-06-14', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #44 R+1 — Lewis Bird — no provider
( 'f0000000-0000-0000-0000-000000000044',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000044',
  '2026-06-14', NULL, '2026-06-16', NULL,
  'airbnb', 2, 203.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #45 R+1 — Keagan Wallace — no provider
( 'f0000000-0000-0000-0000-000000000045',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000045',
  '2026-06-16', NULL, '2026-06-26', NULL,
  'airbnb', 2, 774.86, 'EUR', 0.00, 'confirmed', NULL ),

-- #46 RDC — Sally Bamford — no provider
( 'f0000000-0000-0000-0000-000000000046',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000046',
  '2026-06-17', NULL, '2026-06-20', NULL,
  'airbnb', 2, 267.15, 'EUR', 0.00, 'confirmed', NULL ),

-- #47 RDC — Elizabeth Joy — no provider
( 'f0000000-0000-0000-0000-000000000047',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000047',
  '2026-06-22', NULL, '2026-06-26', NULL,
  'airbnb', 2, 346.29, 'EUR', 0.00, 'confirmed', NULL ),

-- #48 RDC — Lily Carpenter — no provider
( 'f0000000-0000-0000-0000-000000000048',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000048',
  '2026-06-27', NULL, '2026-06-30', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #49 R+1 — Maria Cervantes — no provider
( 'f0000000-0000-0000-0000-000000000049',
  'b0000000-0000-0000-0000-000000000002', NULL, 'e0000000-0000-0000-0000-000000000049',
  '2026-06-27', NULL, '2026-07-04', NULL,
  'airbnb', 2, 555.00, 'EUR', 0.00, 'confirmed', NULL ),

-- #50 RDC — Jael Beek — no provider
( 'f0000000-0000-0000-0000-000000000050',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000050',
  '2026-06-30', NULL, '2026-07-05', NULL,
  'airbnb', 2, 432.56, 'EUR', 0.00, 'confirmed', NULL ),

-- #51 R+1 — Marie-Andrée Balthazar — Chloé
( 'f0000000-0000-0000-0000-000000000051',
  'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000051',
  '2026-07-04', NULL, '2026-07-07', NULL,
  'airbnb', 2, 265.58, 'EUR', 20.00, 'confirmed', 'lit bébé et chaise haute' ),

-- #52 RDC — Ian Brown — Chloé
( 'f0000000-0000-0000-0000-000000000052',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000052',
  '2026-07-06', NULL, '2026-07-12', NULL,
  'airbnb', 2, 519.09, 'EUR', 20.00, 'confirmed', NULL ),

-- #53 R+1 — Clara-Lu Gebhard — Chloé
( 'f0000000-0000-0000-0000-000000000053',
  'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000053',
  '2026-07-07', NULL, '2026-07-10', NULL,
  'airbnb', 2, 265.58, 'EUR', 20.00, 'confirmed', NULL ),

-- #54 RDC — Berangere Cauvin — Chloé
( 'f0000000-0000-0000-0000-000000000054',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000054',
  '2026-07-12', NULL, '2026-07-19', NULL,
  'airbnb', 2, 567.25, 'EUR', 20.00, 'confirmed', NULL ),

-- #55 RDC — Katherine Macnaughton — Jeanne
( 'f0000000-0000-0000-0000-000000000055',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000055',
  '2026-07-24', NULL, '2026-08-01', NULL,
  'airbnb', 2, 644.06, 'EUR', 20.00, 'confirmed', 'lit bébé' ),

-- #56 R+1 — Bernd Adam — Jeanne
( 'f0000000-0000-0000-0000-000000000056',
  'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000056',
  '2026-07-25', NULL, '2026-07-31', NULL,
  'airbnb', 2, 501.59, 'EUR', 20.00, 'confirmed', NULL ),

-- #57 RDC — Theodora Ewer — Jeanne
( 'f0000000-0000-0000-0000-000000000057',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000057',
  '2026-08-03', NULL, '2026-08-08', NULL,
  'airbnb', 2, 434.96, 'EUR', 20.00, 'confirmed', NULL ),

-- #58 Lacanau — Maia Souillot — Jeanne
( 'f0000000-0000-0000-0000-000000000058',
  'b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000058',
  '2026-08-08', NULL, '2026-08-15', NULL,
  'airbnb', 4, 1415.37, 'EUR', 20.00, 'confirmed', NULL ),

-- #59 RDC — Faye Kennedy — Jeanne
( 'f0000000-0000-0000-0000-000000000059',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000059',
  '2026-08-14', NULL, '2026-08-17', NULL,
  'airbnb', 2, 267.16, 'EUR', 20.00, 'confirmed', NULL ),

-- #60 RDC — Agnès Journiac — Jeanne
( 'f0000000-0000-0000-0000-000000000060',
  'b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000060',
  '2026-08-18', NULL, '2026-08-26', NULL,
  'airbnb', 1, 644.06, 'EUR', 20.00, 'confirmed', NULL ),

-- #61 R+1 — Verena We — Jeanne
( 'f0000000-0000-0000-0000-000000000061',
  'b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000061',
  '2026-08-28', NULL, '2026-09-02', NULL,
  'airbnb', 1, 422.92, 'EUR', 20.00, 'confirmed', NULL ),

-- #62 RDC — Bruce Reed — no provider — has check_in_time
( 'f0000000-0000-0000-0000-000000000062',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000062',
  '2026-09-02', '16:00', '2026-09-10', NULL,
  'airbnb', 2, 629.51, 'EUR', 0.00, 'confirmed', NULL ),

-- #63 RDC — Tanja Suchy — no provider — has check_in_time
( 'f0000000-0000-0000-0000-000000000063',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000063',
  '2026-09-12', '18:00', '2026-09-15', NULL,
  'airbnb', 2, 267.99, 'EUR', 0.00, 'confirmed', NULL ),

-- #64 RDC — Jessica Sonnenberg — no provider
( 'f0000000-0000-0000-0000-000000000064',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000064',
  '2026-09-15', NULL, '2026-09-18', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #65 RDC — Bernd Wollenburg — no provider
( 'f0000000-0000-0000-0000-000000000065',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000065',
  '2026-09-19', NULL, '2026-09-23', NULL,
  'airbnb', 2, 344.25, 'EUR', 0.00, 'confirmed', NULL ),

-- #66 RDC — Peter Löw — no provider
( 'f0000000-0000-0000-0000-000000000066',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000066',
  '2026-09-25', NULL, '2026-09-28', NULL,
  'airbnb', 2, 265.58, 'EUR', 0.00, 'confirmed', NULL ),

-- #67 RDC — Stefan Kröger — no provider
-- NOTE: overlaps with #68 (Sharon Easton, check_in 2026-10-08) — no DB constraint prevents this.
( 'f0000000-0000-0000-0000-000000000067',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000067',
  '2026-09-30', NULL, '2026-10-14', NULL,
  'airbnb', 2, 1072.98, 'EUR', 0.00, 'confirmed', NULL ),

-- #68 RDC — Sharon Easton — no provider
-- NOTE: overlaps with #67 (Stefan Kröger, check_out 2026-10-14) — included as-is per spec.
( 'f0000000-0000-0000-0000-000000000068',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000068',
  '2026-10-08', NULL, '2026-10-12', NULL,
  'airbnb', 2, 344.25, 'EUR', 0.00, 'confirmed', NULL ),

-- #69 RDC — Jenny Stringer — no provider
( 'f0000000-0000-0000-0000-000000000069',
  'b0000000-0000-0000-0000-000000000001', NULL, 'e0000000-0000-0000-0000-000000000069',
  '2026-10-14', NULL, '2026-10-18', NULL,
  'airbnb', 2, 344.25, 'EUR', 0.00, 'confirmed', NULL );


-- ============================================================
-- SECTION 12 — BOOKING MISSIONS
-- Only bookings that have a provider get a booking_missions row.
-- All link to mission c0000000-...-000000000001 (Ménage avant CI).
-- Bookings with a provider: #2, #10, #11, #19, #20, #21, #23,
-- #24, #26, #29, #31, #36, #41, #51, #52, #53, #54, #55, #56,
-- #57, #58, #59, #60, #61.
-- ============================================================

INSERT INTO public.booking_missions (booking_id, mission_id) VALUES
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000019', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000020', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000021', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000023', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000024', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000026', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000029', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000031', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000036', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000041', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000052', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000053', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000054', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000055', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000056', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000057', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000058', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000059', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000060', 'c0000000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000061', 'c0000000-0000-0000-0000-000000000001');
