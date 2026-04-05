# Verification Script - Orders Fix

## Run These SQL Queries to Verify Everything is Working

### 1. VERIFY TABLE STRUCTURE
```sql
-- Check orders table has all required columns
\d orders

-- Expected output should show:
-- customer_id | uuid
-- business_id | uuid  
-- order_number | varchar
-- restaurant_email | varchar
-- customer_email | varchar
-- customer_name | varchar
-- customer_phone | varchar
-- items | jsonb
-- subtotal | numeric
-- delivery_fee | numeric
-- total | numeric
-- status | varchar
-- delivery_mode | varchar
-- payment_method | varchar
-- address | text
-- estimated_time | varchar
-- needs_cutlery | boolean
-- created_at | timestamp with time zone
-- updated_at | timestamp with time zone
```

### 2. VERIFY INDEXES
```sql
-- Check all indexes exist
SELECT indexname, tablename 
FROM pg_indexes 
WHERE tablename = 'orders'
ORDER BY indexname;

-- Expected results:
-- idx_orders_customer_id
-- idx_orders_business_id
-- idx_orders_restaurant_email
-- idx_orders_customer_email
-- idx_orders_status
-- idx_orders_created_at
```

### 3. VERIFY RLS POLICIES
```sql
-- Check RLS policies exist
SELECT policyname, cmd, using_expr
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'orders'
ORDER BY policyname;

-- Expected 5 policies:
-- 1. Customers can create orders
-- 2. Customers can update their own orders
-- 3. Customers can view their own orders
-- 4. Business users can update their orders
-- 5. Business users can view their orders
```

### 4. VERIFY FOREIGN KEYS
```sql
-- Check foreign key constraints
SELECT 
  constraint_name,
  table_name,
  column_name,
  foreign_table_name,
  foreign_column_name
FROM
  information_schema.key_column_usage
WHERE
  table_name = 'orders'
  AND foreign_table_name IS NOT NULL;

-- Expected:
-- customer_id → users(id)
-- business_id → users(id)
```

### 5. AFTER CREATING TEST ORDER - VERIFY DATA
```sql
-- Check that orders are being saved with all fields
SELECT 
  id,
  order_number,
  customer_id,
  business_id,
  restaurant_email,
  customer_email,
  customer_name,
  subtotal,
  delivery_fee,
  total,
  status,
  delivery_mode,
  payment_method,
  address,
  needs_cutlery,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 5;

-- Expected: All columns should be populated ✅
```

### 6. VERIFY CUSTOMER CAN ACCESS THEIR ORDERS
```sql
-- Simulate: Login as customer with ID = 'customer-uuid'
-- Run this query while logged in as that customer

SELECT COUNT(*) as my_orders_count
FROM orders
WHERE customer_id = auth.uid()::text;

-- Expected: Should see only their own orders
```

### 7. VERIFY BUSINESS USER CAN ACCESS THEIR ORDERS
```sql
-- Simulate: Login as business user with ID = 'business-uuid'
-- Run this query while logged in as that business user

SELECT COUNT(*) as my_orders_count
FROM orders
WHERE business_id = auth.uid()::text;

-- Expected: Should see only their assigned orders
```

### 8. CHECK FOR ERRORS IN RECENT INSERTS
```sql
-- See if any recent orders have NULL customer_id or business_id
SELECT 
  order_number,
  customer_id,
  business_id,
  status,
  created_at
FROM orders
WHERE (customer_id IS NULL OR business_id IS NULL)
  AND created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Expected: No results (all should have IDs populated)
```

### 9. TEST DATA INTEGRITY
```sql
-- Verify no duplicate orders
SELECT order_number, COUNT(*) as count
FROM orders
GROUP BY order_number
HAVING COUNT(*) > 1;

-- Expected: No results (order_number is UNIQUE)
```

### 10. PERFORMANCE CHECK
```sql
-- Check if indexes are being used
EXPLAIN ANALYZE
SELECT * FROM orders WHERE customer_id = 'some-uuid'::uuid;

-- Look for: "Index Scan" (good) vs "Seq Scan" (bad)
-- Expected: Should use index scan for better performance
```

## Browser Console Verification

When creating an order, check for these messages:

```javascript
✅ [Cart] Saving order to Supabase: ABC123
✅ [Cart] With customer_id: uuid-xxxx-xxxx-xxxx
✅ [Cart] With business_id: uuid-yyyy-yyyy-yyyy
✅ [Cart] With restaurant_email: some-restaurant-id
✅ [Cart] Order saved successfully to Supabase: {...}
```

## Quick Test Scenario

### Test Case 1: Basic Order Creation
```
Steps:
1. Login as Customer A
2. Add items to cart
3. Checkout
4. Place order

Expected Results:
✅ Console shows: Order saved successfully
✅ In Supabase:
   - Order appears in table
   - customer_id = Customer A's ID
   - business_id = Business User ID
   - restaurant_email populated
   - All amounts correct
   - status = "pending"
```

### Test Case 2: Customer Isolation
```
Steps:
1. Login as Customer A
   - See their orders only
   
2. Logout
3. Login as Customer B
   - See their orders only (NOT Customer A's)

Expected Results:
✅ Customer A sees only their orders
✅ Customer B sees only their orders
✅ No cross-contamination
✅ RLS policies enforcing access
```

### Test Case 3: Business User Isolation
```
Steps:
1. Login as Business User A
   - See only orders for their restaurant
   
2. Logout
3. Login as Business User B
   - See only orders for their restaurant

Expected Results:
✅ Business User A sees only their orders
✅ Business User B sees only their orders
✅ Business User A cannot see User B's orders
✅ RLS policies enforcing access
```

## Troubleshooting Checklist

If something isn't working:

### Issue: No orders appear in database
```sql
-- Check:
1. Is RLS policy blocking inserts?
   SELECT * FROM pg_policies WHERE tablename = 'orders';

2. Are the columns correct?
   \d orders

3. Do users exist?
   SELECT id, email, role FROM users LIMIT 5;

4. Check recent errors:
   SELECT * FROM auth.users LIMIT 5;
```

### Issue: Permission denied when inserting
```sql
-- Check RLS policies:
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'orders';

-- The INSERT policy should be:
-- CREATE POLICY "Customers can create orders" ON orders
-- FOR INSERT WITH CHECK (auth.uid()::text = customer_id::text);
```

### Issue: Foreign key constraint violation
```sql
-- Check that users exist:
SELECT id, email, role 
FROM users 
WHERE id IN (
  SELECT DISTINCT customer_id 
  FROM orders 
  WHERE created_at > NOW() - INTERVAL '1 hour'
);

-- Should return valid users
```

### Issue: Null values in customer_id/business_id
```sql
-- Check why IDs aren't being set:
SELECT 
  order_number,
  customer_id,
  business_id,
  created_at
FROM orders
WHERE customer_id IS NULL OR business_id IS NULL
ORDER BY created_at DESC;

-- If any results, the app isn't passing the IDs
-- Check Cart.tsx: user?.id and businessUserId
```

## Final Verification Checklist

- [ ] Table structure is correct (19 columns including customer_id, business_id)
- [ ] All indexes exist (6 indexes)
- [ ] All RLS policies exist (5 policies)
- [ ] Foreign key constraints exist (2 constraints)
- [ ] Test order created successfully
- [ ] Order appears in database with all fields
- [ ] customer_id is populated
- [ ] business_id is populated
- [ ] restaurant_email is populated
- [ ] No console errors
- [ ] Customer can view their orders
- [ ] Business user can view their orders
- [ ] Cross-customer isolation works

## Status Indicators

✅ **GREEN** - All checks passed, orders working
🟡 **YELLOW** - Some checks passed, minor issues
🔴 **RED** - Multiple failures, something broken

Run these checks and report results for support.

---

**Test Date:** April 5, 2026  
**Test Environment:** Development  
**Expected Status:** ✅ ALL PASSING

