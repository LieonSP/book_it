# QA Bug Ledger

This file is maintained automatically by the QA agent after every `/build-and-qa` cycle.
Each entry documents a **recurring bug pattern** — a class of mistake, not just a one-time fix.

The Dev agent reads this file before writing any code, and self-checks against every pattern before submitting a status report.

---

## BUG-001 — DOWN migration SQL executes during UP migration

- **Found in issue:** #1
- **Severity:** Critical
- **Root cause:** Supabase runs the entire migration file as a single SQL execution. When DOWN `DROP` statements are left uncommented in the same file as the UP statements, they execute immediately after the UP — wiping the schema right after creating it.
- **Wrong pattern:**
  ```sql
  -- UP
  CREATE TABLE ...;

  -- DOWN
  DROP TABLE ...; -- ← this RUNS during migration, don't do this
  ```
- **Correct pattern:**
  ```sql
  -- UP
  CREATE TABLE ...;

  -- DOWN (manual rollback only — DO NOT uncomment in this file)
  -- DROP TABLE ...;
  ```
- **Pre-submit check:** Scan every migration file for uncommented `DROP TABLE`, `DROP TYPE`, or `DROP FUNCTION` statements outside of a clearly UP-only section. Flag any found.

---

## BUG-002 — RLS policy subquery references a table the acting role cannot read

- **Found in issue:** #2
- **Severity:** Critical
- **Affected file:** `supabase/migrations/20260410000000_rls_policies.sql`, `bookings_insert` policy (line 513)
- **Root cause:** The `bookings_insert` policy checks whether a provider is authorized by querying `owner_listing` via a JOIN subquery. But `owner_listing` has its own RLS policy (`owner_listing_select`) that only allows `owner_id = auth.uid()`. When the policy evaluates as a provider, the subquery sees 0 rows in `owner_listing` and the INSERT check always fails — blocking even valid provider booking inserts.
- **Symptom:** Scenario 9 fails with `ERROR 42501: new row violates row-level security policy for table "bookings"` even when the provider is correctly authorized.
- **Wrong pattern:**
  ```sql
  -- bookings_insert WITH CHECK (provider path):
  EXISTS (
    SELECT 1
    FROM public.owner_listing ol          -- provider cannot read this table!
    JOIN public.owner_provider op ON op.owner_id = ol.owner_id
    WHERE ol.listing_id  = public.bookings.listing_id
      AND op.provider_id = auth.uid()
  )
  ```
- **Correct pattern (option A — rewrite using owner_provider + listings directly):**
  ```sql
  -- Check: the listing belongs to an owner who manages this provider.
  -- Uses only tables the provider can see (owner_provider via their own provider_id).
  EXISTS (
    SELECT 1
    FROM public.owner_provider op
    JOIN public.owner_listing ol ON ol.owner_id = op.owner_id
    WHERE op.provider_id = auth.uid()
      AND ol.listing_id  = public.bookings.listing_id
  )
  -- Note: this still joins owner_listing, which providers can't read.
  ```
- **Correct pattern (option B — SECURITY DEFINER helper function):**
  ```sql
  -- Create a function that bypasses RLS to check ownership, callable from policies.
  CREATE OR REPLACE FUNCTION public.listing_belongs_to_provider_owner(p_listing_id uuid, p_provider_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.owner_listing ol
      JOIN public.owner_provider op ON op.owner_id = ol.owner_id
      WHERE ol.listing_id  = p_listing_id
        AND op.provider_id = p_provider_id
    );
  $$;
  -- Then in the policy: public.listing_belongs_to_provider_owner(bookings.listing_id, auth.uid())
  ```
- **Pre-submit check:** For every RLS policy that references another RLS-protected table in a subquery, verify that the acting role has SELECT access to that referenced table. If not, use a SECURITY DEFINER function to perform the cross-table check.

---

## BUG-003 — RLS test file uses DO $$ blocks incompatible with Supabase Management API

- **Found in issue:** #2
- **Severity:** Major
- **Affected file:** `__tests__/rls_policies.sql` (original version with DO $$ blocks)
- **Root cause:** The Supabase Management API (used by `supabase db query --linked`) does not support `ROLLBACK TO SAVEPOINT` inside `DO $$` PL/pgSQL blocks — it raises `ERROR 42601: syntax error at or near "TO"`. Additionally, `PERFORM` (PL/pgSQL-only syntax) is also rejected outside of function/procedure bodies.
- **Symptom:** Running the test file via `supabase db query --linked -f __tests__/rls_policies.sql` fails immediately with a syntax error.
- **Correct pattern:** Write RLS tests as plain SQL `BEGIN`/`ROLLBACK` blocks (not DO $$ blocks). Use `SELECT set_config(...)` instead of `PERFORM set_config(...)`. Each scenario is an independent `BEGIN ... ROLLBACK` block.
  ```sql
  -- Correct: plain SQL transaction
  BEGIN;
  INSERT INTO public.listings ...;
  SET LOCAL role = 'authenticated';
  SELECT set_config('request.jwt.claims', '{"sub": "UUID"}', TRUE);
  SELECT COUNT(*) FROM public.listings;
  ROLLBACK;
  ```
- **Pre-submit check:** Never write RLS tests using DO $$ blocks with SAVEPOINT/ROLLBACK TO SAVEPOINT. Always use top-level BEGIN/ROLLBACK. Never use PERFORM outside of PL/pgSQL — use SELECT instead.
