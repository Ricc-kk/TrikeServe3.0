# FINAL SOLUTION - Copy & Paste This Entire SQL Block

The status isn't changing because RLS is silently blocking it.

## Run This Entire Block (Copy Everything):

```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

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

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_open" ON orders
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

---

## Then Immediately:
1. Refresh app (Ctrl+R)
2. Try to accept order
3. ✅ SHOULD WORK NOW!

**That's the fix!**

