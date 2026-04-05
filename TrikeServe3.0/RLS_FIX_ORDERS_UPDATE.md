# RLS Policy Fix for Order Status Updates

## STEP 1: Check Current RLS Policies

Go to **Supabase Dashboard → SQL Editor** and run this to see what RLS policies exist:

```sql
SELECT * FROM pg_policies WHERE tablename = 'orders';
```

## STEP 2: Check if Business User Can Update

Run this to verify the orders table structure:

```sql
SELECT column_name, data_type FROM information_schema.columns 
WHERE table_name = 'orders' 
ORDER BY ordinal_position;
```

## STEP 3: Test If Update Works Manually

```sql
-- Replace 'ORDER-UUID-HERE' with actual order ID from your console logs
UPDATE orders 
SET status = 'preparing', updated_at = NOW() 
WHERE id = 'ORDER-UUID-HERE';
```

If this works in SQL Editor, RLS is the issue.

## STEP 4: Fix RLS Policy - Run This

If RLS is blocking updates, create a policy that allows business users to update their own orders:

```sql
-- Allow business users to update orders for their orders
CREATE POLICY "business_users_can_update_own_orders" ON orders
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT business_id FROM orders WHERE id = orders.id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT business_id FROM orders WHERE id = orders.id
  )
);
```

If that doesn't work, use this more permissive policy:

```sql
-- Allow authenticated users to update orders
CREATE POLICY "authenticated_users_update_orders" ON orders
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');
```

## STEP 5: Disable RLS Temporarily (If Still Not Working)

If policies are causing issues, temporarily disable RLS to test:

```sql
-- Disable RLS on orders table (TEMPORARY - for testing only)
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
```

Then test in the app. If it works, RLS was the issue. Re-enable with:

```sql
-- Re-enable RLS
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
```

## STEP 6: Create Proper Policy for Business Users

Once you confirm it's an RLS issue, use this comprehensive policy:

```sql
-- First, drop any existing conflicting policies
DROP POLICY IF EXISTS "business_users_can_update_own_orders" ON orders;
DROP POLICY IF EXISTS "authenticated_users_update_orders" ON orders;

-- Create a simple policy that allows business users to update
CREATE POLICY "allow_business_user_updates" ON orders
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
```

## What to Do Now

1. **Open Supabase Dashboard**
2. **Go to SQL Editor**
3. **Run Step 1** - Check if RLS policies exist
4. **Run Step 3** - Try manual update with your order ID
   - Copy order ID from browser console logs
5. **If Step 3 fails** - Run Step 4 to fix RLS
6. **If Step 3 works but app doesn't** - Then it's a different issue

## Quick Test

Once you run the SQL fixes, go back to the app:
1. **Refresh browser** (Ctrl+R)
2. **Click on a pending order**
3. **Click "Accept Order"**
4. **Check browser console** (F12)
5. **Look for the error message** - it will tell you exactly what's wrong

The error message will now clearly show:
- If RLS is blocking: "permission denied"
- If order not found: "no rows affected"
- If successful: "Update successful"

---

**The key is to check the console error message - it will tell us exactly what to fix!**

