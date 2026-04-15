-- Count rows after second seed run — should match first run
-- Expected: auth_users=5, public_users=5, listings=4, missions=1, provider_pricing=4, tenants=69, bookings=69
SELECT 'auth_users' AS tbl, COUNT(*) FROM auth.users WHERE id::text LIKE 'a0000000%'
UNION ALL SELECT 'public_users', COUNT(*) FROM public.users WHERE id::text LIKE 'a0000000%'
UNION ALL SELECT 'listings', COUNT(*) FROM public.listings WHERE id::text LIKE 'b0000000%'
UNION ALL SELECT 'missions', COUNT(*) FROM public.missions WHERE id::text LIKE 'c0000000%'
UNION ALL SELECT 'provider_pricing', COUNT(*) FROM public.provider_pricing WHERE id::text LIKE 'd0000000%'
UNION ALL SELECT 'tenants', COUNT(*) FROM public.tenants
UNION ALL SELECT 'bookings', COUNT(*) FROM public.bookings
UNION ALL SELECT 'booking_missions', COUNT(*) FROM public.booking_missions;
