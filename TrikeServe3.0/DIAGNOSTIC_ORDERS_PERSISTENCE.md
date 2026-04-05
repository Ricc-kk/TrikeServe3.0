# DIAGNOSTIC - Orders Not Persisting to Database

## The Problem
Orders disappear when you clear browser cache
= Orders are ONLY in localStorage, NOT in Supabase database

## Why This Happens
1. Orders should save to Supabase ✅
2. Then also save to localStorage (backup)
3. If you clear cache (localStorage), order should still be in Supabase ✅

But if order disappears = it was NEVER saved to Supabase ❌

---

## STEP 1: Verify RLS Policy Was Updated

Run this in Supabase SQL Editor:

```sql
SELECT policyname, cmd
FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;
```

**Expected Result:**
```
policyname                    | cmd
──────────────────────────────┼─────
Anyone can insert orders      | INSERT
Anyone can update orders      | UPDATE
Anyone can view orders        | SELECT
```

If you see the OLD policies (Customers can create orders, etc), then the SQL didn't apply!

---

## STEP 2: Check if Any Orders Are in Database

```sql
SELECT COUNT(*) as total_orders FROM orders;
```

**If result is 0:** No orders were saved to database ❌
**If result > 0:** Some orders saved ✅

---

## STEP 3: Check Browser Console

When you place an order, you should see:

```
[Cart] Saving order to Supabase: ABC123
[Cart] ✅ Order saved successfully to Supabase: {...}
```

**If you DON'T see these messages:**
- Supabase INSERT is not happening
- Check for JavaScript errors above

**If you see ERROR instead:**
- RLS policy still blocking
- Need to fix policy again

---

## STEP 4: Verify Supabase Connection

Check that the order insert code is actually running:

In Cart.tsx, look for these console logs around line 220:

```typescript
console.log('[Cart] Saving order to Supabase:', order.orderNumber);
console.log('[Cart] With customer_id:', user?.id);
console.log('[Cart] With business_id:', businessUserId);
```

You should see these messages BEFORE any error.

---

## MOST LIKELY FIX

The RLS policy SQL didn't apply properly. Try this:

### Option A: Drop and Recreate (Clean)
```sql
-- Drop the old policies
DROP POLICY IF EXISTS "Customers can create orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Customers can view their own orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Business users can view their orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Business users can update their orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Customers can update their own orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Anyone can view orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Anyone can update orders" ON orders CASCADE;

-- Recreate with correct policies
CREATE POLICY "allow_insert_orders" ON orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "allow_view_orders" ON orders
  FOR SELECT USING (true);

CREATE POLICY "allow_update_orders" ON orders
  FOR UPDATE WITH CHECK (true);

SELECT 'Policies recreated' as status;
```

### Option B: Disable RLS Entirely (Fastest)
```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

SELECT 'RLS disabled for orders' as status;
```

Try Option A first, then test.

---

## TEST AFTER FIX

1. Restart dev server: `npm run dev`
2. Create test order
3. Check console for: `Order saved successfully`
4. Check Supabase: `SELECT * FROM orders ORDER BY created_at DESC LIMIT 1;`
5. Clear browser cache (DevTools → Storage → Clear site data)
6. Refresh page
7. Order should still be there ✅

If order is gone after clearing cache = still not in Supabase

---

## KEY INDICATOR

Orders persisting = they're in Supabase ✅
Orders disappearing = they're only in localStorage ❌

After this fix, orders should PERSIST even after clearing cache.

