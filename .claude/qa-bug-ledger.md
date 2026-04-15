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

---

## BUG-004 — Avatar fallback uses `??` instead of `||`, showing empty string for empty `first_name`

- **Found in issue:** #3
- **Severity:** Minor
- **Affected file:** `app/dashboard/page.tsx`, line 101
- **Root cause:** The nullish coalescing operator (`??`) only triggers on `null` or `undefined`. If `first_name` is an empty string `""`, `"".charAt(0).toUpperCase()` evaluates to `""`, which is falsy but not nullish — so `?? "?"` never fires. The avatar circle renders empty instead of showing `?`.
- **Wrong pattern:**
  ```tsx
  const avatarLetter = profile.first_name?.charAt(0).toUpperCase() ?? "?"
  // "" → "" (empty avatar — no fallback triggered)
  ```
- **Correct pattern:**
  ```tsx
  const avatarLetter = profile.first_name?.charAt(0).toUpperCase() || "?"
  // "" → "?" (logical OR catches empty string)
  ```
- **Pre-submit check:** Whenever a string fallback should trigger for both null/undefined AND empty string, use `||` not `??`.

---

## BUG-005 — Shadcn-generated `ThemeProvider` wrapper left in codebase with missing `next-themes` dependency

- **Found in issue:** #3
- **Severity:** Major (blocks production build)
- **Affected file:** `components/ui/theme-provider.tsx`
- **Root cause:** `shadcn` CLI scaffolds a `ThemeProvider` wrapper that imports `next-themes`. When the package is not added to `package.json` (because theming is not needed for the feature), the TypeScript compiler fails the build with `Cannot find module 'next-themes'`. The component is never imported anywhere in the app, so it is dead code — but TypeScript still type-checks it.
- **Wrong pattern:** Leave `components/ui/theme-provider.tsx` in the repo after shadcn scaffolding if `next-themes` is not installed.
- **Correct pattern:** Either install `next-themes` (`npm install next-themes`) or delete `components/ui/theme-provider.tsx` if theming is not required by the feature. Choose deletion if theming is out of scope (v0 scope does not include it).
- **Pre-submit check:** After any shadcn scaffold, run `npm run build` and verify no `Cannot find module` errors. Delete any shadcn-generated files that are not imported anywhere in the app.

---

## BUG-006 — Next.js 16 renames `middleware.ts` convention to `proxy`

- **Found in issue:** #3
- **Severity:** Minor (warning, not a build error — but will become breaking in a future Next.js version)
- **Affected file:** `middleware.ts` (project root)
- **Root cause:** Next.js 16 deprecated the `middleware` file convention. The framework now expects the file to be named `proxy.ts` (and the exported function `proxy`). The old `middleware.ts` still works at runtime but emits a build warning: `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.`
- **Correct pattern:** Rename `middleware.ts` → `proxy.ts` and rename the export `middleware` → `proxy`. Update `config.matcher` export name if required by the new convention.
- **Pre-submit check:** After any Next.js major version bump, check the build output for deprecation warnings and migrate file conventions before they become hard errors.

---

## BUG-007 — Bash `$` interpolation silently corrupts passwords containing special characters

- **Found in issue:** #30
- **Severity:** Major (users cannot log in — password set in auth does not match the intended value)
- **Root cause:** When a password containing `$` (e.g. `Qz$7wLnK@4jD`) is passed inside a bash double-quoted string, the shell expands `$7` as a positional variable (empty string), silently corrupting the password. The API call succeeds with no error but sets a different password than intended.
- **Wrong pattern:**
  ```bash
  PASS="Qz$7wLnK@4jD"
  curl ... -d "{\"password\":\"$PASS\"}"  # $7 is expanded → wrong password
  ```
- **Correct pattern:** Use Python (or any language with native string literals) for API calls that include passwords or secrets with special characters:
  ```python
  payload = json.dumps({"password": "Qz$7wLnK@4jD"}).encode()  # literal, no interpolation
  ```
- **Pre-submit check:** Any time a bash script passes a secret or password to an API, verify it contains no `$`, backticks, or `!` characters. If it does, switch to Python or write the payload to a temp JSON file with `jq` and pass it via `-d @file`.
