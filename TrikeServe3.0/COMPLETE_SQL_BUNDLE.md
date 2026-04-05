# COMPLETE SQL DIAGNOSTIC & FIX BUNDLE

Copy and paste each section into Supabase SQL Editor in order.

---

## SECTION 1: DIAGNOSIS - Run This First

### Check Orders Table Structure and Content
```sql
-- See what columns exist and what data is in them
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```

**Then run:**
```sql
-- See your actual order data
SELECT 
  id,
  order_number,
  business_id,
  restaurant_email,
  customer_name,
  status,
  created_at
FROM orders
ORDER BY created_at DESC
LIMIT 10;
```

**Document the results:**
- Are there orders? (YES/NO)
- What is in `business_id` column? (NULL / UUID / email)
- What is in `restaurant_email` column? (value)

---

## SECTION 2: CHECK BUSINESS USERS

```sql
-- Find your business users
SELECT 
  id,
  email,
  raw_user_meta_data->>'businessName' as business_name,
  created_at
FROM auth.users
WHERE raw_user_meta_data->>'role' = 'business'
LIMIT 10;
```

**Document:**
- What is your business user's ID (UUID)?
- What is their email?

---

## SECTION 3: CHECK RESTAURANTS

```sql
-- See restaurants and their owners
SELECT 
  id,
  name,
  business_user_id,
  created_at
FROM restaurants
ORDER BY created_at DESC
LIMIT 10;
```

**Document:**
- Does your restaurant exist?
- What is its business_user_id?
- Does it match a business user's ID from Section 2?

---

## SECTION 4: COMPARISON QUERY

```sql
-- See the full picture
SELECT 
  o.order_number,
  o.business_id,
  o.restaurant_email,
  u.id as user_id,
  u.email as user_email,
  r.id as restaurant_id,
  r.name as restaurant_name,
  r.business_user_id
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.id
LEFT JOIN restaurants r ON o.restaurant_email = r.id
ORDER BY o.created_at DESC
LIMIT 10;
```

**Check:**
- Do NULL values appear in user_id, user_email, restaurant_id, restaurant_name?
- This tells us what's NOT matching

---

## SECTION 5: FIX - Do This If Needed

### If restaurant_email exists but business_id is NULL:

```sql
-- This will populate business_id from the restaurant's business_user_id
UPDATE orders
SET business_id = restaurants.business_user_id
FROM restaurants
WHERE orders.restaurant_email = restaurants.id
  AND orders.business_id IS NULL;

-- Verify it worked:
SELECT COUNT(*) as orders_with_business_id 
FROM orders 
WHERE business_id IS NOT NULL;
```

---

## SECTION 6: VERIFY THE FIX

```sql
-- Run this to confirm everything is connected properly
SELECT 
  o.order_number,
  o.business_id,
  o.restaurant_email,
  u.email as business_user_email,
  r.name as restaurant_name,
  o.customer_name,
  o.status,
  o.created_at
FROM orders o
LEFT JOIN auth.users u ON o.business_id = u.id
LEFT JOIN restaurants r ON o.restaurant_email = r.id
ORDER BY o.created_at DESC
LIMIT 10;
```

**Success looks like:**
- No NULL values in user_email, restaurant_name
- All orders connected properly

---

## QUICK COPY-PASTE VERSION

If you want to run everything at once:

```sql
-- 1. Check structure
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders';

-- 2. See orders
SELECT id, order_number, business_id, restaurant_email, customer_name, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10;

-- 3. Check business users
SELECT id, email, raw_user_meta_data->>'businessName' as business_name FROM auth.users WHERE raw_user_meta_data->>'role' = 'business' LIMIT 10;

-- 4. Check restaurants
SELECT id, name, business_user_id FROM restaurants ORDER BY created_at DESC LIMIT 10;

-- 5. Full comparison
SELECT o.order_number, o.business_id, o.restaurant_email, u.email, r.name, r.business_user_id FROM orders o LEFT JOIN auth.users u ON o.business_id = u.id LEFT JOIN restaurants r ON o.restaurant_email = r.id ORDER BY o.created_at DESC LIMIT 10;

-- 6. FIX (if needed)
UPDATE orders SET business_id = restaurants.business_user_id FROM restaurants WHERE orders.restaurant_email = restaurants.id AND orders.business_id IS NULL;

-- 7. Verify
SELECT COUNT(*) as orders_fixed FROM orders WHERE business_id IS NOT NULL;
```

---

## CODE CHANGES MADE

I've already updated:

### BusinessOrders.tsx
- Changed query from `WHERE business_id = currentUser.id`
- To: `WHERE restaurant_email = businessRestaurantId`
- This matches how orders are saved (restaurant_email is set in Cart.tsx)

### Why restaurant_email?
Because in Cart.tsx, we set:
```typescript
restaurant_email: checkoutRestaurant.id  // The restaurant's ID from FoodHome
```

So we should query by that same field instead of business_id which may be null/wrong.

---

## WHAT TO DO

1. **Run SECTION 1** - See what's in your database
2. **Run SECTION 2 & 3** - Check business users and restaurants
3. **Run SECTION 4** - Compare and see what's missing
4. **If needed, run SECTION 5** - Fix the data
5. **Run SECTION 6** - Verify it worked
6. **Try the app** - Place an order, check if it shows

---

## EXPECTED OUTCOME

After code change + potential SQL fix + fresh order:

```
[BusinessOrders] ✅ Found 1 order(s)
```

NOT:

```
[BusinessOrders] ℹ️  No orders found
```

