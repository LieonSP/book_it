-- Count bookings where provider_id is NULL — expected: 45
-- These are bookings with no assigned provider, which should be allowed
-- after the nullable migration (20260413000000).
SELECT COUNT(*) AS null_provider_bookings
FROM public.bookings
WHERE provider_id IS NULL;
