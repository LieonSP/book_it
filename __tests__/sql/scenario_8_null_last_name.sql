-- Count users with NULL last_name — expected: 5 (Anne So + 4 providers)
-- This validates migration 20260413000001 allows nullable last_name
-- and the seed correctly inserts all 5 users with last_name = NULL.
SELECT COUNT(*) AS null_last_name_count
FROM public.users
WHERE last_name IS NULL;
