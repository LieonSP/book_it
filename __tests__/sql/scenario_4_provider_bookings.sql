-- Count bookings per provider in the seeded data
-- Expected (from seed analysis):
--   Alana  = 2 bookings  (#2, #11)
--   Chloé  = 9 bookings  (#20, #23, #24, #26, #29, #51, #52, #53, #54)
--   Jeanne = 11 bookings (#19, #31, #36, #41, #55, #56, #57, #58, #59, #60, #61)
--   Norah  = 2 bookings  (#10, #21)
SELECT u.first_name, COUNT(b.id) AS booking_count
FROM public.users u
LEFT JOIN public.bookings b ON b.provider_id = u.id
WHERE u.type = 'provider'
GROUP BY u.id, u.first_name
ORDER BY u.first_name;
