# ✅ QUICK FIX - DO THIS NOW

## What I Fixed

**BusinessOrders.tsx** - Changed the query from:
```typescript
// OLD (looking for wrong column):
WHERE business_id = currentUser.id

// NEW (looking for matching restaurant):
WHERE restaurant_email = businessRestaurantId
```

This matches how orders are SAVED (with `restaurant_email = checkoutRestaurant.id`).

---

## Now Do This

### Step 1: Run SQL Diagnostic
Go to **Supabase SQL Editor** and run this:

```sql
SELECT 
  o.order_number,
  o.restaurant_email,
  o.business_id,
  r.name as restaurant_name,
  r.business_user_id
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_email = r.id
ORDER BY o.created_at DESC
LIMIT 5;
```

**Tell me what you see:**
1. How many orders?
2. What values in `restaurant_email`?
3. What values in `business_id`?
4. What values in `business_user_id`?

---

### Step 2: If business_id is NULL, Run This Fix

```sql
UPDATE orders
SET business_id = restaurants.business_user_id
FROM restaurants
WHERE orders.restaurant_email = restaurants.id
  AND orders.business_id IS NULL;
```

Then verify:
```sql
SELECT order_number, business_id FROM orders WHERE business_id IS NOT NULL;
```

---

### Step 3: Test the App

1. **Refresh** your browser (new code loaded)
2. **Log in as CUSTOMER**
3. **Place a NEW test order**
4. **Log in as BUSINESS USER**
5. **Go to Orders tab**
6. **Check console** - Look for:
   - `[BusinessOrders] ✅ Found 1 order(s)` ✅ SUCCESS
   - OR `[BusinessOrders] ℹ️  No orders found` ❌ Still broken

---

## If Still Not Working

The code is now querying by `restaurant_email` which is what gets saved in Cart.

If it STILL doesn't show:
1. Check that `restaurant_email` has a real value (not NULL)
2. Check that value matches a restaurant ID in restaurants table
3. Make sure you're using the SAME BUSINESS USER who owns the restaurant

---

## What Values Should Match

In the database:

```
orders.restaurant_email = restaurants.id    ✅
restaurants.business_user_id = auth.users.id    ✅
```

When app queries:
```
SELECT * FROM orders 
WHERE restaurant_email = restaurantId    ✅
```

Where `restaurantId` comes from the business user's restaurant lookup.

---

## The 3 SQL Queries You Might Need

### Query 1: Diagnose
```sql
SELECT o.order_number, o.restaurant_email, o.business_id, r.name, r.business_user_id 
FROM orders o 
LEFT JOIN restaurants r ON o.restaurant_email = r.id 
ORDER BY o.created_at DESC 
LIMIT 5;
```

### Query 2: Fix (if business_id is NULL)
```sql
UPDATE orders 
SET business_id = restaurants.business_user_id 
FROM restaurants 
WHERE orders.restaurant_email = restaurants.id AND orders.business_id IS NULL;
```

### Query 3: Verify
```sql
SELECT o.order_number, u.email, r.name, o.customer_name, o.status 
FROM orders o 
LEFT JOIN auth.users u ON o.business_id = u.id 
LEFT JOIN restaurants r ON o.restaurant_email = r.id 
ORDER BY o.created_at DESC LIMIT 5;
```

All columns should be filled (no NULL).

---

## Summary

✅ **Code fixed:** BusinessOrders now queries by `restaurant_email`  
✅ **SQL provided:** To fix data if needed  
✅ **Instructions:** Follow the steps above  

**Next**: Run the SQL diagnostic, tell me the results, and we'll fix from there!

