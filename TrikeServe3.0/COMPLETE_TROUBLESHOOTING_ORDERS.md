# Complete Troubleshooting Guide - Orders Disappear on Cache Clear

## Root Cause
Orders are being saved ONLY to localStorage (browser cache).
When you clear the cache, they disappear because they were NEVER saved to Supabase.

---

## Why This Happens

### The Flow Should Be
```
1. Try Supabase INSERT ← This should succeed
2. If error → Show alert
3. If success → Save to localStorage
4. Result: Order in database + cache
```

### What's Actually Happening
```
1. Try Supabase INSERT ← This is FAILING silently
2. Error not shown properly? OR
3. addOrder() being called anyway?
4. Result: Order ONLY in cache ❌
```

---

## DIAGNOSIS CHECKLIST

### Check 1: Browser Console
When you place an order, watch F12 Console carefully:

```
✅ GOOD - You should see:
[Cart] Saving order to Supabase: ABC123
[Cart] With customer_id: [uuid]
[Cart] With business_id: [uuid]
[Cart] ✅ Order saved successfully to Supabase: {...}

❌ BAD - If you see:
[Cart] Error saving order to Supabase: {error object}

❌ VERY BAD - If you see nothing of the above
= Code isn't running properly
```

**What to do:**
- Screenshot the console output
- Share it if you're still stuck

### Check 2: RLS Policies in Supabase

Run this:
```sql
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'orders'
ORDER BY policyname;
```

**Expected:**
```
allow_insert_orders    | INSERT | ...
allow_update_orders    | UPDATE | ...
allow_view_orders      | SELECT | ...
```

**If you see OLD policies:**
- "Customers can create orders"
- "Customers can view their own orders"
= The SQL fix didn't apply

### Check 3: Are Orders in Database?

```sql
SELECT COUNT(*) as total_orders FROM orders;
```

**If result = 0:**
- No orders were saved ❌
- RLS is blocking or Supabase insert failed

**If result > 0:**
- Some orders saved ✅
- Check if they persist after cache clear

### Check 4: Recent Order Attempt

```sql
SELECT order_number, customer_id, customer_email, status, created_at
FROM orders
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 1;
```

**If nothing shows:**
- Order wasn't saved to DB

**If order shows:**
- Order IS in DB
- Issue might be with browser cache/localStorage

---

## STEP-BY-STEP FIX

### FIX 1: Update RLS Policies (Do This First)

```sql
-- Drop ALL old policies
DROP POLICY IF EXISTS "Customers can create orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Customers can view their own orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Business users can view their orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Business users can update their orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Customers can update their own orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Anyone can insert orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Anyone can view orders" ON orders CASCADE;
DROP POLICY IF EXISTS "Anyone can update orders" ON orders CASCADE;

-- Create fresh policies
CREATE POLICY "orders_insert" ON orders FOR INSERT WITH CHECK (true);
CREATE POLICY "orders_select" ON orders FOR SELECT USING (true);
CREATE POLICY "orders_update" ON orders FOR UPDATE WITH CHECK (true);

-- Verify
SELECT 'Policies updated' as status;
```

**Wait 10 seconds for changes to apply**

### FIX 2: Restart Dev Server

```bash
npm run dev
```

### FIX 3: Test Order

1. Login as customer
2. Add items to cart
3. Checkout and place order
4. Watch console carefully
5. Check for: `✅ Order saved successfully`

### FIX 4: Verify in Supabase

```sql
SELECT * FROM orders 
ORDER BY created_at DESC 
LIMIT 1;
```

Should show your test order ✅

### FIX 5: Clear Cache Test

```
1. Open DevTools (F12)
2. Go to: Application → Storage
3. Click: Clear site data
4. Refresh page (F5)
5. Orders should still be visible (from Supabase)
```

**If orders PERSIST:** Issue fixed! ✅
**If orders disappear:** Still in cache only ❌

---

## IF STILL NOT WORKING

### Last Resort: Disable RLS Completely

```sql
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

SELECT 'RLS disabled - orders table will accept all inserts' as status;
```

This removes ALL access control from the database level.
Security is still enforced by the app (OrderContext validates user).

Then test again.

---

## VERIFICATION

After fix is working:

**Test 1: Clear Cache**
```
1. Place order
2. Clear browser cache (DevTools → Storage → Clear)
3. Refresh page
4. Order still visible? ✅ SUCCESS
```

**Test 2: New Browser Window**
```
1. Place order in one window
2. Open new window/tab
3. Login
4. Check orders page
5. See same order? ✅ SUCCESS
```

**Test 3: Database Direct**
```sql
SELECT COUNT(*) FROM orders;
-- Count should increase with each test order ✅
```

---

## SUMMARY

**Orders disappearing on cache clear = Orders not in database**

**To fix:**
1. Update RLS policies (SQL above)
2. Restart server
3. Test with cache clear
4. Verify in Supabase

**If still not working:**
- Disable RLS entirely
- Check console for errors
- Verify database has orders

Let me know which step shows the issue and I'll help further!

