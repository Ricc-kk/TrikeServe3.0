# SQL Diagnostic Queries for Order Sync Issue

Run these queries in your **Supabase SQL Editor** to diagnose the issue.

## Query 1: Check Recent Orders

```sql
-- See the last 10 orders that were created
SELECT 
  id,
  order_number,
  business_id,
  customer_id,
  customer_name,
  status,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;
```

**What to look for:**
- Is your test order there?
- What `business_id` was saved? (Copy this)
- Is it a valid UUID format?

---

## Query 2: Check Business Users

```sql
-- See all business users (restaurant owners)
SELECT 
  id,
  email,
  raw_user_meta_data->>'businessName' as business_name,
  raw_user_meta_data->>'role' as role
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'business'
ORDER BY created_at DESC
LIMIT 10;
```

**What to look for:**
- Find your business user
- Copy their `id` UUID
- Does it match the `business_id` from Query 1?

---

## Query 3: Check Restaurants Table

```sql
-- See all restaurants and their owners
SELECT 
  id,
  name,
  business_user_id,
  created_at
FROM restaurants
ORDER BY created_at DESC
LIMIT 10;
```

**What to look for:**
- Is your restaurant there?
- Does `business_user_id` match your business user's ID from Query 2?
- If not, this needs to be fixed!

---

## Query 4: Check for ID Mismatches

```sql
-- Find orders where business_id doesn't exist in auth.users
SELECT 
  o.id,
  o.order_number,
  o.business_id,
  u.id as user_exists
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.id
WHERE o.business_id IS NOT NULL
ORDER BY o.created_at DESC
LIMIT 10;
```

**What to look for:**
- If `user_exists` column is NULL = the business_id doesn't match any user
- This would explain why orders don't show!

---

## Query 5: Check RLS Policies on Orders Table

```sql
-- See what RLS policies exist for orders table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;
```

**What to look for:**
- Are there SELECT policies?
- Do they allow access for authenticated users?
- Do they check business_id correctly?

---

## Query 6: Test RLS Manually (Advanced)

```sql
-- This simulates accessing orders as a specific business user
-- Replace 'YOUR_USER_ID' with the actual UUID
SELECT 
  *
FROM orders
WHERE business_id = 'YOUR_USER_ID'
LIMIT 5;
```

**What to look for:**
- Does it return rows?
- If yes, RLS isn't blocking
- If no rows, either no orders match or RLS is blocking

---

## Quick Diagnosis Path

1. **Run Query 1** → Copy the `business_id` from your test order
2. **Run Query 2** → Find your business user, copy their `id`
3. **Are they the same?**
   - YES → Orders should show, check RLS policies (Query 5)
   - NO → This is the problem! Need to fix how business_id is saved

4. **Run Query 3** → Check if restaurant is linked to correct business user
5. **Run Query 4** → Check if any order business_ids match actual users

---

## If Query Results Show Problems

### Problem: Order has NULL business_id

**SQL to check:**
```sql
SELECT COUNT(*) as null_business_ids FROM orders WHERE business_id IS NULL;
```

**Fix needed:** 
- Restaurant objects need to pass businessUserId when creating orders
- Check FoodHome.tsx is passing businessUserId field

---

### Problem: Restaurant has wrong business_user_id

**SQL to fix it:**
```sql
UPDATE restaurants 
SET business_user_id = 'CORRECT_USER_UUID_HERE'
WHERE id = 'RESTAURANT_ID_HERE';
```

**How to get the right UUIDs:**
- From Query 2: Get business user's id
- From your app: Log in, check currentUser.id in DevTools

---

### Problem: Order business_id doesn't match any user

**This means:**
- The UUID saved was incorrect
- Or the business user was deleted
- Or data is corrupted

**SQL to check which IDs exist:**
```sql
SELECT DISTINCT business_id FROM orders WHERE business_id IS NOT NULL;
```

Then compare with:
```sql
SELECT id FROM auth.users WHERE raw_user_meta_data->>'role' = 'business';
```

---

## Copy-Paste Template for Full Diagnosis

```sql
-- ===== STEP 1: Check your test order =====
SELECT * FROM orders ORDER BY created_at DESC LIMIT 1;

-- ===== STEP 2: Check your business user =====
SELECT * FROM auth.users WHERE email = 'YOUR_EMAIL_HERE';

-- ===== STEP 3: Check restaurant ownership =====
SELECT * FROM restaurants WHERE business_user_id = 'COPY_USER_ID_FROM_STEP_2';

-- ===== STEP 4: Check if order business_id matches =====
SELECT 
  business_id,
  (SELECT COUNT(*) FROM auth.users u WHERE u.id = orders.business_id) as matching_users
FROM orders 
ORDER BY created_at DESC
LIMIT 5;
```

---

## Once Fixed, Verify

```sql
-- After making fixes, run this to confirm:
SELECT 
  o.order_number,
  o.business_id,
  u.email as business_user_email,
  r.name as restaurant_name,
  o.customer_name,
  o.status
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.id
LEFT JOIN restaurants r ON r.business_user_id = o.business_id
ORDER BY o.created_at DESC
LIMIT 5;
```

This should show:
- Order details
- The business user's email (not null)
- The restaurant name (not null)
- All properly connected

---

## Troubleshooting Guide

| Symptom | Query to Run | Expected Fix |
|---------|--------------|--------------|
| Order has NULL business_id | Query 1 | Fix FoodHome.tsx to pass businessUserId |
| business_id doesn't match user ID | Query 4 | Update how businessUserId is obtained |
| Restaurant has wrong owner | Query 3 | Update restaurants table business_user_id |
| RLS is blocking | Query 5 + 6 | Check RLS policies allow SELECT |
| Orders appear NULL everywhere | Query 1 | Verify order insertion succeeded |

---

**Once you identify the issue from these queries, let me know and I can apply the fix!**

