-- Check existing policies on menu_items table
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'menu_items'
ORDER BY policyname;

