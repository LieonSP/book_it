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

---

## BUG-008 — Provider cannot read listings via owner_listing join (RLS mismatch)

- **Found in issue:** #36
- **Severity:** Critical
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (provider fetchListings path)
- **Root cause:** The provider listing fetch queries `owner_provider → owner_listing → listings`. But `owner_listing`'s SELECT RLS policy is `owner_id = auth.uid()` — providers are never owners, so the embedded `owner_listing` join always returns empty rows. The form shows "Aucune propriété disponible" to every provider even when they have valid relationships.
- **Wrong pattern:**
  ```ts
  // Provider queries owner_provider with nested owner_listing — but RLS blocks owner_listing for providers
  supabase.from("owner_provider")
    .select("owner_id, owner_listing(listing_id, listings(id, name))")
    .eq("provider_id", userId)
  // Result: owner_listing is always [] because provider can't read it
  ```
- **Correct pattern:** Query `listings` directly using the `listings_select` RLS path that allows providers who have existing bookings, OR add a SECURITY DEFINER helper function / RLS exception on `owner_listing` that also allows `provider_id = auth.uid()` (via `owner_provider`). Alternatively, add a direct `owner_provider → listings` view/function that bypasses the restriction.
- **Pre-submit check:** When writing a nested Supabase query (embedded joins), verify that the acting role has SELECT access on EVERY table in the join chain via its own RLS policies. If any intermediate table is blocked, the entire nested result returns empty — not an error, just silently empty.

---

## BUG-009 — Provider cannot resolve ownerIdContext from owner_listing (RLS mismatch)

- **Found in issue:** #36
- **Severity:** Critical
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (`resolveOwner` effect, ~line 303)
- **Root cause:** When a provider selects a listing, the form queries `owner_listing` to find the `owner_id`. But `owner_listing`'s SELECT RLS is `owner_id = auth.uid()` — a provider querying by `listing_id` will always get 0 rows. `ownerIdContext` stays `null` forever, missions never load, and form submission always fails with "missing ownerIdContext" guard.
- **Wrong pattern:**
  ```ts
  // This always returns nothing for a provider (not an owner)
  supabase.from("owner_listing").select("owner_id").eq("listing_id", listingId).single()
  ```
- **Correct pattern:** Add a SECURITY DEFINER function `get_listing_owner(listing_id uuid)` that bypasses RLS and returns the `owner_id`, callable by any authenticated user. Or store `owner_id` directly on the listings table to avoid the join.
- **Pre-submit check:** Any read of `owner_listing` by a non-owner user (provider or admin) must go through a SECURITY DEFINER function, not a direct Supabase client query.

---

## BUG-010 — Provider cannot read missions for the owner (RLS mismatch)

- **Found in issue:** #36
- **Severity:** Critical
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (`fetchMissions` effect, ~line 368)
- **Root cause:** The `missions_select` policy allows a provider to see missions only via `EXISTS (booking_missions JOIN bookings WHERE provider_id = auth.uid())`. A provider with no existing bookings cannot read ANY missions. On their first booking creation, the Mission dropdown is always empty, making the form unusable.
- **Wrong pattern:**
  ```ts
  // Provider with 0 existing bookings gets 0 mission rows — correct per policy but blocks first use
  supabase.from("missions").select("id, label, owner_id").eq("owner_id", ownerIdContext)
  ```
- **Correct pattern:** Extend `missions_select` to also allow `EXISTS (owner_provider op WHERE op.provider_id = auth.uid() AND op.owner_id = missions.owner_id)` — i.e., a provider can read all missions for owners they work with, regardless of whether they have existing bookings.
- **Pre-submit check:** When defining RLS SELECT policies for lookup/reference tables (missions, pricing, etc.), verify that a brand-new provider (0 existing bookings) can still read the data they need to create their first booking.

---

## BUG-011 — Provider rollback silently fails: tenant DELETE blocked by RLS

- **Found in issue:** #36
- **Severity:** Critical
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (`handleSubmit`, ~line 551)
- **Root cause:** When booking INSERT fails in the provider path, the form tries to delete the orphaned tenant (`supabase.from("tenants").delete().eq("id", tenant.id)`). But `tenants_delete` RLS is `owner_id = auth.uid()` — the tenant was created with `owner_id = listingOwnerId` (not the provider's uid). The DELETE silently returns 0 rows without error, leaving an orphaned tenant in the database.
- **Wrong pattern:**
  ```ts
  // This silently does nothing for a provider — RLS blocks it
  await supabase.from("tenants").delete().eq("id", tenant.id)
  ```
- **Correct pattern (option A):** Extend `tenants_delete` to also allow `EXISTS (owner_provider op WHERE op.provider_id = auth.uid() AND op.owner_id = tenants.owner_id)`.
- **Correct pattern (option B):** Use a SECURITY DEFINER RPC `rollback_failed_booking(tenant_id, booking_id)` that handles the cleanup atomically.
- **Pre-submit check:** For every cleanup/rollback DELETE in a multi-role INSERT flow, verify that the acting role's DELETE RLS policy covers the row they are trying to delete. The owner_id on the row may differ from auth.uid() when a provider creates data on behalf of an owner.

---

## BUG-012 — Empty string sent to a typed DB column when optional field is left blank

- **Found in issue:** #36
- **Severity:** Critical
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (`handleSubmit`, bookings INSERT)
- **Root cause:** Form state initialises string fields to `""`. When a field is made optional (validation check removed), the empty string is still passed directly to the INSERT. For typed columns (uuid, numeric, date…), Postgres rejects `""` with a type error. The form shows a generic error and the booking is never created.
- **Wrong pattern:**
  ```ts
  const [providerId, setProviderId] = useState("")
  // ...
  await supabase.from("bookings").insert({ provider_id: providerId }) // "" is not a valid uuid
  ```
- **Correct pattern:** Coerce empty string to `null` (or the appropriate zero value) before every INSERT for any optional typed column:
  ```ts
  await supabase.from("bookings").insert({
    provider_id: providerId || null,   // uuid — empty string → null
    nb_pax:      parseInt(nbPax) || 0, // integer — keep 0 as valid
  })
  ```
- **Pre-submit check:** After making any field optional (removing its required validation), trace the field all the way to every INSERT/UPDATE that uses it and verify the empty-string case is explicitly handled. Never rely on the DB to coerce `""` — it won't.

---

## BUG-013 — PostgREST embed silently returns empty when two tables share a column reference but have no direct FK

- **Found in issue:** #36
- **Severity:** Critical
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (provider `fetchListings`, ~line 264)
- **Root cause:** `owner_provider` and `owner_listing` both have an `owner_id` column that is a FK to `users.id`, but there is no direct FK between `owner_provider` and `owner_listing`. PostgREST requires a direct FK to resolve an embedded join. Without one, the embed silently returns empty rows — no error, no warning, just `[]`.
- **Wrong pattern:**
  ```ts
  // owner_provider has no FK to owner_listing — embed silently returns []
  supabase.from("owner_provider")
    .select("owner_id, owner_listing(listing_id, listings(id, name))")
    .eq("provider_id", userId)
  ```
- **Correct pattern:** Split into two explicit queries joined in JavaScript:
  ```ts
  // Step 1: get owner_ids
  const { data: ownerRows } = await supabase
    .from("owner_provider").select("owner_id").eq("provider_id", userId)
  // Step 2: get listings for those owners
  const { data: listingRows } = await supabase
    .from("owner_listing").select("listing_id, listings(id, name)")
    .in("owner_id", ownerRows.map(r => r.owner_id))
  ```
- **Pre-submit check:** Before writing any PostgREST nested embed (`table1.select("table2(...)")`), verify that a direct FK exists between `table1` and `table2` in the schema. If the two tables only share a common reference (both FK to the same third table), PostgREST cannot resolve the join — use a two-step query instead.

---

## BUG-014 — tenants_select blocks provider from reading a just-inserted tenant (no booking yet)

- **Found in issue:** #36
- **Severity:** Critical
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (`handleSubmit`, tenant INSERT step)
- **Root cause:** In a multi-step INSERT flow (tenant → booking → booking_missions), a provider inserts the tenant in step 1. `tenants_select` only allows providers to read tenants via existing bookings (`b.provider_id = auth.uid() AND b.tenant_id = tenants.id`). But no booking exists yet at step 1. The `.insert(...).select("id").single()` INSERT succeeds, but the SELECT returns null — the provider can't read the row they just created. The form sees `!tenant`, shows a generic error, and the orphaned tenant is never deleted.
- **Wrong pattern:** Multi-step INSERT + SELECT where RLS depends on a later INSERT that hasn't happened yet.
- **Correct pattern:** For each table involved in a multi-step INSERT flow, verify that the acting role can SELECT the row immediately after INSERT — before any dependent rows are created. If not, extend the SELECT policy with an unconditional arm (e.g. `owner_provider` membership) that doesn't require downstream rows to exist.
- **Pre-submit check:** For every `.insert(...).select(...).single()` in a multi-step flow, manually trace the SELECT RLS: can the acting role read that row right after INSERT, with no other rows yet created? If the SELECT policy references a table that only gets populated in a LATER step, it will silently return null.

---

## BUG-015 — listings_select restricts providers to listings with existing bookings only

- **Found in issue:** #36
- **Severity:** Critical
- **Root cause:** `listings_select` allowed providers to read listings only via `bookings WHERE provider_id = auth.uid()`. A provider with no booking on a given listing couldn't see it — including on their very first booking attempt on that listing. The same class of bug as BUG-010 (missions) and BUG-008 (owner_listing), applied to `listings`.
- **Wrong pattern:** Lookup/reference tables (listings, missions, etc.) that providers need for data entry restricted to only rows already linked via existing bookings.
- **Correct pattern:** Extend SELECT policies on all lookup tables with an `owner_provider` arm:
  ```sql
  OR EXISTS (
    SELECT 1 FROM owner_provider op
    JOIN owner_listing ol ON ol.owner_id = op.owner_id
    WHERE op.provider_id = auth.uid()
      AND ol.listing_id = public.listings.id
  )
  ```
- **Pre-submit check:** For every table a provider reads during data entry (listings, missions, pricing, tenants…), ask: "Can a provider with zero existing bookings still read the rows they need?" If the answer relies on existing bookings, the policy is too restrictive.

---

## BUG-016 — Auto-fill overwrites manually entered fee when mission or provider changes

- **Found in issue:** #36
- **Severity:** Major
- **Affected file:** `app/reservations/nouvelle/nouvelle-reservation-form.tsx` (`runAutoFill` effect, ~line 433)
- **Root cause:** The `useEffect([providerId, missionId, ownerIdContext])` that runs `runAutoFill` does not check whether `isFeeAuto` was previously cleared by a manual edit. If a user manually sets a fee (isFeeAuto = false), then changes the mission, the effect fires and overwrites the manual value if a pricing match is found — restoring the Auto badge without user consent.
- **Wrong pattern:**
  ```ts
  // No guard: fires even after user manually cleared the Auto badge
  useEffect(() => {
    runAutoFill(providerId, missionId, ownerIdContext)
  }, [providerId, missionId, ownerIdContext])
  ```
- **Correct pattern:** Track a `feeWasManuallyEdited` ref (not state, to avoid re-renders). Reset it to `false` when provider OR mission changes (not when the fee input itself changes). Only run auto-fill if `feeWasManuallyEdited` is false.
  ```ts
  const feeWasManuallyEdited = useRef(false)
  // In fee onChange: feeWasManuallyEdited.current = true; setIsFeeAuto(false)
  // In provider/mission onChange: feeWasManuallyEdited.current = false
  // In effect: if (feeWasManuallyEdited.current) return
  ```
- **Pre-submit check:** Any auto-fill effect that can overwrite user input must check whether the user has manually edited the field since the last auto-fill trigger. Use a ref (not state) to track this to avoid infinite re-render loops.

---

## BUG-017 — SQL test files that expect a trigger RAISE EXCEPTION cannot be run as a single file with `supabase db query`

- **Found in issue:** #33
- **Severity:** Minor (test infrastructure — not a production bug)
- **Affected files:** `__tests__/sql/issue-33-scenario7-trigger-provider-fee.sql`, `__tests__/sql/issue-33-scenario8-trigger-pricing-id.sql`
- **Root cause:** When a SQL test file contains a `BEGIN` block that causes a trigger to `RAISE EXCEPTION`, the Supabase Management API returns HTTP 400 for the entire file and exits with code 1 — even if subsequent SELECT statements would have confirmed the correct behaviour. The API cannot continue after an exception mid-file.
- **Wrong pattern:** Putting the trigger-blocked UPDATE and the verification SELECT in the same file — the API aborts on the exception and never runs the SELECT.
- **Correct pattern:** Split trigger tests into two parts:
  1. File (or block) that runs the UPDATE — expect exit code 1 (the trigger fires, this is the pass signal).
  2. A separate inline `supabase db query --linked "SELECT ..."` to verify the data is unchanged.
  - Alternatively, document in the test file's header that exit code 1 = PASS for the trigger test, and run the verification SELECT as a follow-up command in the QA script.
- **Pre-submit check:** Any SQL test that intentionally expects a `RAISE EXCEPTION` from a trigger must NOT rely on statements after the failing block in the same file. Verify the negative case (data unchanged) in a separate query.

---

## BUG-018 — Empty state shown even on initial load when owner has no bookings: "Réinitialiser les filtres" CTA is misleading

- **Found in issue:** #6
- **Severity:** Minor (UX / copy bug)
- **Affected file:** `app/synthese/page.tsx`, line 516–526
- **Root cause:** The empty state renders the same message ("Aucune réservation pour ces filtres.") and "Réinitialiser les filtres" CTA whether the owner has genuinely no bookings at all, or merely has no bookings matching the current filters. When an owner has zero bookings, the reset button is pointless — clicking it changes nothing. This creates a confusing UX for new owners.
- **Wrong pattern:** A single empty-state branch covering both "no data exists" and "filters produce no match".
- **Correct pattern:** Distinguish two cases:
  1. `bookings.length === 0` → "Vous n'avez aucune réservation." (no reset button)
  2. `filteredBookings.length === 0 && bookings.length > 0` → "Aucune réservation pour ces filtres." + reset button
- **Pre-submit check:** For every empty state on a filtered list, ask: "Could this screen appear on first use with zero data?" If yes, write two separate empty-state branches — one for "no data" and one for "filters active, no match".

---

## BUG-019 — SQL test fixture UUIDs must be all-hex (no alphabetic-word prefixes)

- **Found in issue:** #74
- **Severity:** Minor (test infrastructure — breaks SQL tests but not production code)
- **Affected file:** `__tests__/extraction_rls.sql` (original version with `year1111-...` UUIDs)
- **Root cause:** UUIDs in Postgres must match the format `[0-9a-f]{8}-[0-9a-f]{4}-...`. Using a non-hex prefix like `year1111-` causes `ERROR 22P02: invalid input syntax for type uuid`. The SQL file fails entirely and no test results are returned.
- **Wrong pattern:**
  ```sql
  INSERT INTO public.bookings (id, ...) VALUES ('year1111-0000-0000-0000-000000000001', ...)
  -- ERROR: "year" contains non-hex characters y, e, a, r
  ```
- **Correct pattern:** Use only hex characters in all UUID segments:
  ```sql
  INSERT INTO public.bookings (id, ...) VALUES ('a1b21111-0000-0000-0000-000000000001', ...)
  ```
- **Pre-submit check:** Before running any SQL test file, scan every hardcoded UUID literal and verify each segment contains only `[0-9a-f]`. Flag any UUID with letters g–z or non-hex word prefixes.

---

## BUG-020 — Adding an item to a UI array broke a stale "exact count" regression test, and lint errors shipped to `main`

- **Found in issue:** routine status check (no issue number — surfaced by running `npm run lint` / `npm test` / `npm run build` cold, which apparently isn't done as a gate before merge)
- **Severity:** Moderate (test suite red on `main`; build passes but with real ESLint errors)
- **Affected files:** `__tests__/issue-50-dashboard-tiles.test.ts`, `app/dashboard/page.tsx`, `__tests__/app-header.test.tsx`, `components/book-it/input-field.tsx`
- **Root cause (two separate issues, same root cause: no pre-merge lint/test gate):**
  1. Issue #74 (Extraction screen) added a third tile to `OWNER_CARDS` in `app/dashboard/page.tsx`. The issue #50 regression test asserted `toHaveLength(2)` for "exactly N active tiles" — nobody updated that assertion when the array grew, so `npm test` was already failing on `main`.
  2. `__tests__/app-header.test.tsx` used `require("fs")` / `require("path")` inline instead of ES imports (15 ESLint errors), and `components/book-it/input-field.tsx` called `React.useId()` conditionally inside `id || React.useId()` (a `react-hooks/rules-of-hooks` violation) — both pre-existing, both unrelated to recent feature work, neither caught before merge.
- **Wrong pattern:** Writing an "exactly N items" test for an array that's expected to grow, with no comment flagging it as brittle; running `npm run build`/`npm test` locally without also running `npm run lint` before considering a task done.
- **Correct pattern:** When a regression test asserts an exact count on a list that other issues are expected to extend (nav tiles, card grids, menu items), add a one-line comment on the assertion naming which issue it guards and why the number might need to change. Before any status report, run `npm run lint`, `npm test`, and `npm run build` together — not just the one the task happens to touch.
- **Pre-submit check:** Before marking a task done, run all three: `npm run lint`, `npm test`, `npm run build`. If a test asserts an exact array length, check whether the PR's own diff changes that array — if so, update the assertion in the same commit, don't leave it for later.

---

## BUG-021 — Dev Supabase project disappeared silently; prod restore left the migration tracker out of sync; `/deploy` used a method that bypasses the tracker

- **Found in issue:** routine status check, 2026-09-11 (no issue number)
- **Severity:** Critical (production security gap — a missing RLS-adjacent trigger — went undetected until a manual check)
- **Root cause (three compounding issues):**
  1. The dev project (ref `fzlqnjcfwpuomvldafwv`, documented in `CLAUDE.md`) no longer existed in the Supabase account at all — DNS for it returned NXDOMAIN, and it was absent from `supabase projects list`. Nobody had checked connectivity in a while, so this went unnoticed.
  2. After a prod DB restore, `npx supabase migration list --linked` showed the most recent migration (`20260416000002_block_provider_fee_update.sql` — a security trigger blocking providers from tampering with `provider_fee`/`pricing_id`) present locally but missing on remote. The restore snapshot predated it. Nothing had re-checked migration sync after the restore.
  3. `.claude/commands/deploy.md` Step 4 ran migrations with `npx supabase db query --linked -f <file>.sql`, which does **not** update `supabase_migrations.schema_migrations` — directly contradicting the non-negotiable rule elsewhere in `CLAUDE.md` to always use `db push --linked`. This is a plausible root cause for tracker drift on any future deploy, independent of the restore.
- **Wrong pattern:** Assuming a documented project ref still exists; assuming a DB restore preserves all migrations; running `db query -f` for migrations instead of `db push`.
- **Correct pattern:** After ANY restore, pause/resume, or long gap since last touching a Supabase project, run `npx supabase migration list --linked` before assuming schema is current — do not just check the app builds. Migrations must always go through `db push --linked`, never `db query -f` on individual files, so the tracker stays authoritative.
- **Pre-submit check:** Before any prod deploy or status check, run `npx supabase projects list` to confirm the target project ref actually exists and is `ACTIVE_HEALTHY`, then `npx supabase migration list --linked` to confirm every migration has a matching `local`/`remote` entry. Fixed in `deploy.md` Step 4 to use `db push --linked` with a before/after `migration list --linked` check.

---

## BUG-022 — `vitest.config.ts`'s `@` alias is a hardcoded absolute path to the main checkout, so new files that only exist in a worktree can't be unit-tested from that worktree

- **Found in issue:** #84 (Provider mission-assigned email notification), during QA
- **Severity:** Major (silently blocks testing of any new code in a worktree; would have produced a false "can't verify" or forced an untested merge)
- **Affected file:** `vitest.config.ts` (line 26: `"@": "/Users/philippechambert-loir/Documents/Repos/book_it"`)
- **Root cause:** Dev work for this repo happens in git worktrees under `.claude/worktrees/<branch>/`, each an isolated checkout. `vitest.config.ts` resolves the `@/...` import alias (used everywhere, including this issue's own `lib/notifications/*.ts` and `app/api/.../route.ts`) to a hardcoded absolute path pointing at the *original* checkout, not `__dirname`/the worktree running the tests. For files that exist identically in both locations this is invisible — the alias silently resolves to a stale-but-identical copy. But for files that only exist in the worktree (i.e. any new file added by the current task, before it's merged to the original checkout), `@/...` imports throw `Cannot find package`, and `npx vitest run` on the new test file fails outright.
- **Wrong pattern:**
  ```ts
  resolve: { alias: { "@": "/Users/philippechambert-loir/Documents/Repos/book_it" } }
  ```
- **Correct pattern:** Resolve the alias relative to the config file itself, so it always points at whichever checkout (main or worktree) is actually running the tests:
  ```ts
  resolve: { alias: { "@": __dirname } }
  ```
- **Pre-submit check:** Before running `npx vitest run` on any newly added file that uses `@/...` imports (or before trusting a "N tests passed" count from a worktree), verify the alias in `vitest.config.ts` resolves relative to the config file, not to a hardcoded path. A quick smoke test: import any new `@/...`-only file in a throwaway test and confirm it resolves, rather than assuming the full-suite pass count covers it.
- **Resolved:** Fixed during the same build, by the orchestrator, after an independent re-run of the full suite (outside QA's temporary local patch) reproduced the 2 failures QA had worked around. `vitest.config.ts` now uses `fileURLToPath(new URL(".", import.meta.url))` instead of `__dirname` (this repo's `vitest.config.ts` is loaded as an ES module, where `__dirname` isn't available) — same effect, portable across any checkout. Full suite verified green (331/331) with the fix in place, not worked around. Lesson for the orchestrator role specifically: **don't trust a sub-agent's reported pass count without an independent re-run** — a QA agent's local, reverted workaround can make its own report true while the actual committed state still fails.
