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
