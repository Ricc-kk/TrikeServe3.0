# SQL Diagnostic - Run in Supabase SQL Editor

## STEP 1: Check What's Actually in the Orders Table

Run this first to see the structure and data:

```sql
SELECT 
  id,
  order_number,
  business_id,
  customer_id,
  customer_name,
  restaurant_email,
  restaurant_name,
  status,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;
```

**Copy the output and check:**
- Is your test order there?
- What value is in the `business_id` column? (null, UUID, email, etc?)
- What is `restaurant_email`?

---

## STEP 2: Check All Column Names in Orders Table

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

**This will show you EXACTLY which columns exist.**

---

## STEP 3: Check Business Users

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'businessName' as business_name
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'business'
LIMIT 10;
```

Copy your business user's `id` and `email` from here.

---

## STEP 4: Check Restaurants

```sql
SELECT 
  id,
  name,
  business_user_id
FROM restaurants
ORDER BY created_at DESC
LIMIT 10;
```

Does the `business_user_id` match any user IDs from STEP 3?

---

## STEP 5: Find the Connection

Once you know:
- What column names exist in orders table
- What value is actually in business_id (could be email, UUID, etc)
- What your business user's ID is

Run this to find which business user owns the order:

```sql
-- If business_id is a UUID:
SELECT 
  o.order_number,
  o.business_id,
  u.email,
  u.id
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.id
ORDER BY o.created_at DESC
LIMIT 5;
```

Or if business_id might be an email:

```sql
SELECT 
  o.order_number,
  o.business_id,
  o.restaurant_email,
  u.email,
  u.id
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.email OR o.restaurant_email = u.email
ORDER BY o.created_at DESC
LIMIT 5;
```

---

## What to Report Back

After running these queries, tell me:

1. **What columns exist in orders table?** (list them)
2. **What value is in business_id?** (example: null, '12345-uuid', 'email@example.com')
3. **What is your business user's ID?** (UUID from auth.users)
4. **Do they match?** (yes/no)
5. **Is there a restaurant_email column?** (yes/no)
6. **What is the restaurant_email value?** (example: the restaurant's ID or email)

---

## LIKELY SCENARIO

Based on the error, I suspect:
- Orders are being saved with `business_id = null` or `business_id = restaurant_email`
- But BusinessOrders is querying by user UUID
- They don't match!

The fix will be to **either:**
- Change what we save as business_id (use the actual user UUID)
- **OR** change how we query (use restaurant_email instead)

---

## Quick Fix Attempt

If business_id is NULL or wrong, try this query first:

```sql
-- Check if restaurant_email has values
SELECT 
  order_number,
  restaurant_email,
  COUNT(*) as count
FROM orders
GROUP BY restaurant_email
LIMIT 10;
```

If restaurant_email has consistent values, then we need to query by that instead!

