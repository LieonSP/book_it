-- ============================================================
-- UP
-- Make users.last_name nullable.
--
-- WHY: Some providers or test users may have a single-part name
-- (e.g. "Alana", "Norah") with no family name recorded. Forcing
-- NOT NULL requires a dummy value like 'N/A', which pollutes the
-- data model. NULL is the correct representation for "unknown or
-- not applicable".
-- ============================================================

ALTER TABLE public.users ALTER COLUMN last_name DROP NOT NULL;


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- To roll back, copy this statement to a new migration file
-- or run it manually in the Supabase SQL editor.
-- ============================================================

-- ALTER TABLE public.users ALTER COLUMN last_name SET NOT NULL;
