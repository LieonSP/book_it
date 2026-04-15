-- Check listings owned by Anne So — expected: 4
SELECT COUNT(*) AS listing_count
FROM public.owner_listing
WHERE owner_id = 'a0000000-0000-0000-0000-000000000001';

-- Check bookings on Anne So's listings — expected: 69
SELECT COUNT(*) AS booking_count
FROM public.bookings b
JOIN public.owner_listing ol ON ol.listing_id = b.listing_id
WHERE ol.owner_id = 'a0000000-0000-0000-0000-000000000001';
