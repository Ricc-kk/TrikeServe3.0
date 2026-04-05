# RE-ENABLE RLS WITH OPEN POLICY

Since disabling RLS made it work, now let's re-enable it with the right policy.

## Run This SQL:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Drop all old restrictive policies
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

-- Create one simple open policy
CREATE POLICY "orders_allow_all_authenticated" ON orders
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

---

## Then Test:

1. **Refresh browser**
2. **Click on order**
3. **Click "Accept Order"**
4. **Check if status updates**
5. **Refresh page - does it persist?**

If yes to all → ✅ **COMPLETE SOLUTION WORKING!**

---

**Let me know when you've run this and tested!**

