-- Verify listing count for Anne So — expected: 4
SELECT COUNT(*) AS listing_count
FROM public.owner_listing
WHERE owner_id = 'a0000000-0000-0000-0000-000000000001';
