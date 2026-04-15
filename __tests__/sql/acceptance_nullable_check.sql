-- Verify nullable columns for acceptance criteria
-- Expected: both provider_id (bookings) and last_name (users) should be YES (nullable)
SELECT column_name, table_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('bookings', 'users')
  AND column_name IN ('provider_id', 'last_name')
ORDER BY table_name, column_name;
