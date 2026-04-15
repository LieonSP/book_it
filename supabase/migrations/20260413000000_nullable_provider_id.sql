-- ============================================================
-- UP
-- Make bookings.provider_id nullable.
--
-- WHY: Owners need to create bookings before assigning a provider
-- (e.g. the date is confirmed but the cleaner is not yet scheduled).
-- Keeping provider_id NOT NULL would force a dummy value or a
-- two-step workflow; NULL is the correct semantic here.
-- ============================================================

ALTER TABLE public.bookings ALTER COLUMN provider_id DROP NOT NULL;

-- ============================================================
-- RLS VERIFICATION — provider SELECT policy is safe with NULL
-- ============================================================
-- The "bookings_select" policy grants providers access via:
--
--   provider_id = auth.uid()
--
-- In SQL, NULL = <any value> evaluates to NULL (not TRUE).
-- PostgreSQL's USING clause treats NULL as FALSE, so rows where
-- provider_id IS NULL are correctly invisible to providers.
-- No policy rewrite is needed — the existing policy already
-- handles NULL provider_id safely by design of SQL three-valued logic.
--
-- Similarly, bookings_update and booking_missions policies that
-- reference provider_id = auth.uid() are unaffected: a NULL
-- provider_id will never match auth.uid(), keeping unassigned
-- bookings read- and write-protected from providers.
-- ============================================================


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- To roll back, copy this statement to a new migration file
-- or run it manually in the Supabase SQL editor.
-- ============================================================

-- ALTER TABLE public.bookings ALTER COLUMN provider_id SET NOT NULL;
