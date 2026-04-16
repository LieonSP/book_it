-- ============================================================
-- UP
--
-- Adds a trigger on public.bookings that blocks any UPDATE that
-- attempts to change provider_fee or pricing_id when the calling
-- user is a provider.
--
-- WHY a trigger instead of relying on the frontend guard:
-- The frontend already greys out and locks these fields for
-- providers. But a determined user could call the Supabase API
-- directly (e.g. via curl or the Supabase client SDK). This
-- trigger is the authoritative, DB-level enforcement layer.
--
-- HOW it works:
-- The trigger function looks up the calling user's type in
-- public.users. If the type is 'provider' AND either
-- provider_fee or pricing_id has changed, it raises an exception
-- that aborts the entire UPDATE transaction.
--
-- SECURITY NOTE:
-- The function is SECURITY DEFINER so it can read public.users
-- without being affected by its own RLS policies at call time.
-- ============================================================

-- ----------------------------------------------------------------
-- Step 1 — Trigger function
-- ----------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.block_provider_fee_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
-- Stable is not appropriate for a trigger function that reads the
-- DB and aborts transactions — we use VOLATILE (the default).
AS $$
DECLARE
  v_user_type text;
BEGIN
  -- Look up the calling user's type.
  -- auth.uid() returns the UUID of the authenticated user making the request.
  SELECT type INTO v_user_type
  FROM public.users
  WHERE id = auth.uid();

  -- Only apply the restriction to providers
  IF v_user_type = 'provider' THEN
    -- Check whether provider_fee has changed.
    -- We use IS DISTINCT FROM rather than <> so that NULL vs NULL
    -- comparisons work correctly (NULL <> NULL is NULL, not TRUE).
    IF (NEW.provider_fee IS DISTINCT FROM OLD.provider_fee)
       OR (NEW.pricing_id IS DISTINCT FROM OLD.pricing_id)
    THEN
      RAISE EXCEPTION
        'Providers cannot modify provider_fee or pricing_id on a booking.'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- All checks passed — allow the UPDATE to proceed
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------
-- Step 2 — Attach the trigger to bookings
-- ----------------------------------------------------------------

-- Drop if it already exists so the migration is idempotent
DROP TRIGGER IF EXISTS trg_block_provider_fee_update ON public.bookings;

CREATE TRIGGER trg_block_provider_fee_update
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.block_provider_fee_update();


-- ============================================================
-- DOWN (manual rollback only — DO NOT uncomment in this file)
-- ============================================================

-- -- DROP TRIGGER IF EXISTS trg_block_provider_fee_update ON public.bookings;
-- -- DROP FUNCTION IF EXISTS public.block_provider_fee_update();
