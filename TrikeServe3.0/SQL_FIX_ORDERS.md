# SQL Fix - If Orders Have Wrong Data

After running the diagnostic queries from RUN_THIS_SQL_FIRST.md, if you find that:
- Orders exist but have NULL or wrong business_id
- Orders have correct restaurant_email values
- You want to populate business_id properly

Use these SQL fixes:

## Fix 1: If orders have restaurant_email but need business_id populated

```sql
-- Update business_id from restaurant_email by joining with restaurants table
UPDATE orders
SET business_id = restaurants.business_user_id
FROM restaurants
WHERE orders.restaurant_email = restaurants.id
  AND orders.business_id IS NULL;

-- Check the results:
SELECT COUNT(*) as updated_count FROM orders WHERE business_id IS NOT NULL;
```

---

## Fix 2: If you need to see what would be updated

```sql
-- Preview what WOULD be updated (dry run)
SELECT 
  o.order_number,
  o.restaurant_email,
  o.business_id as current_business_id,
  r.business_user_id as would_become
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_email = r.id
WHERE o.business_id IS NULL
LIMIT 10;
```

---

## Fix 3: Verify the fix worked

```sql
-- Check that orders now have matching IDs
SELECT 
  o.order_number,
  o.restaurant_email,
  o.business_id,
  u.email as business_user_email,
  r.name as restaurant_name
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.id
LEFT JOIN restaurants r ON o.restaurant_email = r.id
ORDER BY o.created_at DESC
LIMIT 10;
```

All columns should be populated (not NULL).

---

## Alternative: If restaurant_email values are also inconsistent

Check what values are in restaurant_email:

```sql
SELECT 
  DISTINCT restaurant_email,
  COUNT(*) as order_count
FROM orders
WHERE restaurant_email IS NOT NULL
GROUP BY restaurant_email
ORDER BY order_count DESC;
```

Then match with your restaurants table:

```sql
SELECT 
  id,
  name,
  business_user_id
FROM restaurants
ORDER BY created_at DESC;
```

---

## Complete Verification After Code Fix

Once you've:
1. ✅ Updated the code to query by restaurant_email
2. ✅ Run the SQL fixes if needed
3. ✅ Placed a new test order

Run this query to verify everything works:

```sql
SELECT 
  o.id,
  o.order_number,
  o.restaurant_email,
  o.business_id,
  o.customer_name,
  o.status,
  u.email as business_owner,
  r.name as restaurant_name,
  o.created_at
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.id
LEFT JOIN restaurants r ON o.restaurant_email = r.id
ORDER BY o.created_at DESC
LIMIT 5;
```

You should see:
- ✅ restaurant_email has a value (matches a restaurant ID)
- ✅ business_id has a value (matches a user ID)
- ✅ business_owner email is not NULL
- ✅ restaurant_name is not NULL

---

## Rollback (if something goes wrong)

```sql
-- Revert business_id changes
UPDATE orders
SET business_id = NULL
WHERE business_id IS NOT NULL;
```

---

**Which SQL should you run?**

1. First: Run diagnostic queries from RUN_THIS_SQL_FIRST.md
2. Report back what you see
3. I'll tell you which fix to run (probably Fix 1)
4. After fix, verify with the verification query

