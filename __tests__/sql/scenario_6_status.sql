-- Verify all bookings have status = 'confirmed' — expected: single row confirmed | 69
SELECT status, COUNT(*) AS count
FROM public.bookings
GROUP BY status;
