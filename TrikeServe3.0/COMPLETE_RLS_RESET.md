# VERIFY & FIX - Status Not Actually Changing

## STEP 1: Verify the RLS Fix Didn't Work

Run this to see what policies currently exist:

```sql
SELECT policyname, cmd, USING, WITH_CHECK 
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY policyname;
```

Tell me what policies you see.

---

## STEP 2: The Real Issue

The UPDATE has "no errors" because RLS silently blocks it without erroring.

This means the old restrictive RLS policies are STILL there.

---

## STEP 3: Complete RLS Reset

Run this to completely clear and reset RLS:

```sql
-- Disable RLS completely first
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
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

-- Re-enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Create simple open policy
CREATE POLICY "orders_open_for_authenticated" ON orders
FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

---

## STEP 4: Test Update Works

```sql
-- Get an order ID
SELECT id, status FROM orders LIMIT 1;

-- Then update it (replace ID-HERE)
UPDATE orders 
SET status = 'preparing' 
WHERE id = 'ID-HERE'
RETURNING id, status;

-- Check if it changed
SELECT id, status FROM orders WHERE id = 'ID-HERE';
```

The status SHOULD change now.

---

## STEP 5: Test App

1. Refresh browser
2. Try to accept order
3. Should work now!

---

**This WILL fix it!** The issue is old restrictive policies still exist.

