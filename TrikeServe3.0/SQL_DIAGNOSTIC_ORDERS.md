# SQL DIAGNOSTIC - Copy & Paste into Supabase SQL Editor

## QUERY 1: Check Orders Table Structure
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

---

## QUERY 2: See All Recent Orders (Last 20)
```sql
SELECT id, order_number, status, restaurant_email, customer_name, created_at, updated_at
FROM orders
ORDER BY created_at DESC
LIMIT 20;
```

---

## QUERY 3: Check If Your Test Order is There
Look for your test order in the results from Query 2. Then run this to see its details:

```sql
-- Replace 'YOUR-ORDER-ID-HERE' with actual ID from console
SELECT * FROM orders 
WHERE id = 'YOUR-ORDER-ID-HERE';
```

---

## QUERY 4: Try Manual Update (Test If Updates Work at All)
```sql
-- Replace 'YOUR-ORDER-ID-HERE' with actual ID
UPDATE orders 
SET status = 'preparing', updated_at = NOW()
WHERE id = 'YOUR-ORDER-ID-HERE'
RETURNING *;
```

If this works → RLS policy is blocking the app
If this fails → Data/schema issue

---

## QUERY 5: Check RLS Policies on Orders Table
```sql
SELECT schemaname, tablename, policyname, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;
```

---

## QUERY 6: Check Update RLS Policies Specifically
```sql
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename = 'orders' AND cmd = 'UPDATE'
ORDER BY policyname;
```

---

## QUICK COPY-PASTE ALL AT ONCE

Run each section one at a time:

### Section 1: See table structure
```sql
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

### Section 2: See recent orders
```sql
SELECT id, order_number, status, restaurant_email, customer_name, created_at 
FROM orders
ORDER BY created_at DESC 
LIMIT 20;
```

### Section 3: Get a sample order ID and check it
```sql
SELECT id, order_number, status, updated_at
FROM orders
ORDER BY created_at DESC
LIMIT 1;
```

Then copy that ID and run:

### Section 4: Try manual update
```sql
UPDATE orders 
SET status = 'ready', updated_at = NOW()
WHERE id = 'PASTE-ID-HERE'
RETURNING id, status, updated_at;
```

If that manual update works:
- ✅ Data/schema is fine
- ❌ RLS policy is blocking the app

If it fails:
- ❌ Database/data issue

### Section 5: Check RLS policies
```sql
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'orders';
```

---

## WHAT TO REPORT BACK

After running these, tell me:

1. **Does table have `id` and `status` columns?** (YES/NO)
2. **How many orders in the table?** (number)
3. **What is the status of the most recent order?** (pending/preparing/etc)
4. **Did manual UPDATE work?** (YES/NO)
   - If YES → RLS is blocking the app
   - If NO → Data issue
5. **How many RLS policies exist?** (number)
6. **What are the policy names?** (list them)

---

## ONCE YOU KNOW THE ISSUE

If manual update WORKS but app doesn't:
→ Need to fix RLS policy

If manual update FAILS:
→ Need to check data/schema

If RLS policies exist and are restrictive:
→ Need to loosen them or adjust app logic

---

**Run these queries and let me know the results!**

