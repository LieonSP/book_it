-- Verify all 4 pricing presets have fee = 20.00 EUR
-- Expected: preset_count=4, min_fee=20.00, max_fee=20.00
SELECT COUNT(*) AS preset_count, MIN(fee) AS min_fee, MAX(fee) AS max_fee
FROM public.provider_pricing
WHERE id::text LIKE 'd0000000%';
