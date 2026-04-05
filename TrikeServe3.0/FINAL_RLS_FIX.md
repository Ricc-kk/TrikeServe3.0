# FINAL FIX - RLS Policy for App Updates

Since manual SQL UPDATE works but app doesn't, RLS is blocking the app.

## STEP 1: Check Current RLS Policies

```sql
SELECT policyname, cmd, USING, WITH_CHECK 
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY cmd;
```

Tell me what you see.

---

## STEP 2: Most Likely Fix - Remove Restrictive Policies

If you see policies like:
- `business_users_can_select`
- `business_users_can_update`
- `business_users_can_insert`

Drop them:

```sql
DROP POLICY IF EXISTS "business_users_can_select" ON orders;
DROP POLICY IF EXISTS "business_users_can_update" ON orders;
DROP POLICY IF EXISTS "business_users_can_insert" ON orders;
DROP POLICY IF EXISTS "orders_authenticated_all_policy" ON orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
```

---

## STEP 3: Create Simple Working Policy

```sql
CREATE POLICY "allow_authenticated_updates" ON orders
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

---

## STEP 4: Test App

1. Refresh browser
2. Try to accept order
3. Should work now! ✅

---

## If Still Doesn't Work

Disable RLS temporarily to confirm it's the issue:

```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
```

Try app. If it works:
- ✅ Confirmed RLS is the issue

Re-enable with open policy:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "orders_all_authenticated" ON orders
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

---

## ALTERNATIVE: If You Want Stricter RLS

Only allow business users to update their own orders:

```sql
CREATE POLICY "business_users_update_own_orders" ON orders
FOR UPDATE
USING (auth.uid() = business_id)
WITH CHECK (auth.uid() = business_id);
```

(This requires business_id column to be set to the user's auth.uid())

---

## COPY-PASTE FIX (If You Want Quick Working Solution)

Run this:

```sql
-- Remove all old policies
DROP POLICY IF EXISTS "business_users_can_select" ON orders;
DROP POLICY IF EXISTS "business_users_can_update" ON orders;
DROP POLICY IF EXISTS "business_users_can_insert" ON orders;
DROP POLICY IF EXISTS "orders_authenticated_all_policy" ON orders;
DROP POLICY IF EXISTS "orders_insert_policy" ON orders;
DROP POLICY IF EXISTS "allow_authenticated_updates" ON orders;

-- Create new permissive policy
CREATE POLICY "orders_allow_authenticated_all" ON orders
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

Then refresh app and test!

---

**This is the final fix!** 🚀

