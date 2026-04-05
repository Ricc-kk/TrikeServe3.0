# KEEP IT WORKING - Re-enable RLS Properly

Now that you know RLS was the issue, run this to keep it working with security:

## Copy & Paste This:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_users_can_select" ON orders;
DROP POLICY IF EXISTS "business_users_can_update" ON orders;
DROP POLICY IF EXISTS "business_users_can_insert" ON orders;
DROP POLICY IF EXISTS "business_users_can_delete" ON orders;
DROP POLICY IF EXISTS "orders_authenticated_all_policy" ON orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
DROP POLICY IF EXISTS "orders_select_policy" ON orders;
DROP POLICY IF EXISTS "orders_allow_all" ON orders;
DROP POLICY IF EXISTS "orders_allow_authenticated_all" ON orders;
DROP POLICY IF EXISTS "allow_authenticated_updates" ON orders;
DROP POLICY IF EXISTS "allow_all" ON orders;
DROP POLICY IF EXISTS "all_authenticated_can_manage" ON orders;
DROP POLICY IF EXISTS "orders_everything_allowed" ON orders;
DROP POLICY IF EXISTS "orders_open" ON orders;

CREATE POLICY "orders_allow_all_authenticated" ON orders
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

## Then Test:
1. Refresh app
2. Accept order
3. ✅ Should still work!

**Do this now to make it permanent!**

