# Business User Order Isolation - Migration Guide

## 📋 Overview

This guide helps you migrate your existing Supabase setup to use the new restaurant-based order isolation system.

---

## 🎯 What's Changing

### Before
```sql
orders table:
├─ customer_id (user who ordered)
├─ business_id (user who owns restaurant)
└─ NO restaurant_id (orders not linked to specific restaurant)

Problem: Difficult to isolate by restaurant in RLS policies
```

### After
```sql
orders table:
├─ customer_id (user who ordered)
├─ business_id (user who owns restaurant) [kept for compatibility]
├─ restaurant_id ← NEW (explicit restaurant reference)
└─ Proper RLS isolation by restaurant_id

Benefit: Clean, restaurant-aware order isolation
```

---

## 📝 Migration Steps

### Step 1: Add restaurant_id Column
Execute this SQL in your Supabase SQL Editor:

```sql
-- Add restaurant_id column to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);
```

**Time:** ~30 seconds
**Impact:** No data loss
**Reversible:** Yes (can be dropped)

### Step 2: Populate restaurant_id for Existing Orders

For each existing order, we need to link it to the correct restaurant.

#### Option A: If you have one restaurant per business user
```sql
UPDATE orders
SET restaurant_id = (
  SELECT restaurants.id 
  FROM restaurants 
  WHERE restaurants.business_user_id = orders.business_id
  LIMIT 1
)
WHERE restaurant_id IS NULL;
```

#### Option B: If you have multiple restaurants per business user
You'll need to identify which restaurant each order was from. If stored somewhere:

```sql
UPDATE orders
SET restaurant_id = <restaurant_id>
WHERE id IN (
  SELECT order_id FROM <your_source_table>
);
```

#### Option C: If you can't determine restaurant
Set to a default restaurant for now:

```sql
UPDATE orders
SET restaurant_id = '<default-restaurant-uuid>'
WHERE restaurant_id IS NULL;
```

**Note:** You can always update order.restaurant_id later if needed.

### Step 3: Update RLS Policies

Replace old RLS policies with new ones:

```sql
-- Drop old policies
DROP POLICY IF EXISTS "Customers can view their orders" ON orders;
DROP POLICY IF EXISTS "Businesses can view orders for their restaurant" ON orders;

-- Create new restaurant-aware policies
CREATE POLICY "Customers can view their own orders" ON orders
  FOR SELECT USING (auth.uid()::text = customer_id::text);

CREATE POLICY "Business users can view orders for their restaurant only" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

CREATE POLICY "Customers can create orders" ON orders
  FOR INSERT WITH CHECK (auth.uid()::text = customer_id::text);

CREATE POLICY "Business users can update orders for their restaurant only" ON orders
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

CREATE POLICY "Customers can update their own orders" ON orders
  FOR UPDATE USING (auth.uid()::text = customer_id::text)
  WITH CHECK (auth.uid()::text = customer_id::text);
```

**Time:** ~1 minute
**Impact:** Changes authorization rules

### Step 4: Update Application Code

When creating orders in your app, ensure you set restaurant_id:

```typescript
// In Cart.tsx or wherever orders are created
const order = {
  // ... existing fields
  restaurant_id: selectedRestaurant.id,  // ← ADD THIS
  // ... other fields
};

// Then save to Supabase
const { error } = await supabase
  .from('orders')
  .insert([order]);
```

### Step 5: Test Migration

Run these queries to verify everything works:

```sql
-- Test 1: Check restaurant_id is populated
SELECT COUNT(*) as total_orders,
       COUNT(restaurant_id) as orders_with_restaurant,
       COUNT(*) - COUNT(restaurant_id) as orders_missing_restaurant
FROM orders;

-- Test 2: Verify RLS policies exist
SELECT * FROM pg_policies WHERE tablename = 'orders';

-- Test 3: Verify indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'orders';

-- Expected Results:
-- Test 1: orders_with_restaurant = total_orders
-- Test 2: Shows 5 new policies
-- Test 3: Shows idx_orders_restaurant index
```

---

## ⚠️ Important Notes

### Data Continuity
- Existing orders remain accessible
- No data is deleted during migration
- Customers still see their orders
- Business users can still update orders

### Rollback Plan
If something goes wrong:

```sql
-- Remove restaurant_id column (CAREFUL - only if absolutely necessary)
ALTER TABLE orders DROP COLUMN restaurant_id CASCADE;

-- Restore old RLS policies
CREATE POLICY "Customers can view their orders" ON orders
  FOR SELECT USING (auth.uid()::text = customer_id::text);

CREATE POLICY "Businesses can view orders for their restaurant" ON orders
  FOR SELECT USING (auth.uid()::text = business_id::text);
```

### Performance Impact
- **Before Migration:** ~0ms (no change)
- **After Migration:** ~0ms (with proper indexes)
- **RLS Evaluation:** ~1-5ms per query (depends on restaurant size)

---

## 🧪 Testing Checklist

- [ ] restaurant_id column exists
- [ ] restaurant_id is populated for all orders
- [ ] idx_orders_restaurant index exists
- [ ] New RLS policies are in place
- [ ] Old RLS policies are removed
- [ ] Customers can view their orders
- [ ] Business User A can view Restaurant A orders
- [ ] Business User A CANNOT view Restaurant B orders
- [ ] Status updates work for authorized users
- [ ] Customers can create orders

---

## 📊 Migration Checklist

### Pre-Migration
- [ ] Backup your Supabase database
- [ ] Review this guide
- [ ] Identify restaurant owners for existing orders
- [ ] Schedule maintenance window (optional)

### Migration
- [ ] Execute Step 1 (Add restaurant_id column)
- [ ] Execute Step 2 (Populate restaurant_id)
- [ ] Verify data with test queries
- [ ] Execute Step 3 (Update RLS policies)
- [ ] Execute Step 4 (Update app code)

### Post-Migration
- [ ] Run testing checklist
- [ ] Verify in browser
- [ ] Check Supabase logs for errors
- [ ] Monitor application performance
- [ ] Document any issues

---

## 🎯 Verification Commands

### Verify Column Added
```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;
```
**Look for:** restaurant_id (UUID)

### Verify Data Populated
```sql
SELECT 
  COUNT(*) as total,
  COUNT(restaurant_id) as with_restaurant,
  COUNT(restaurant_id) * 100.0 / COUNT(*) as percent_filled
FROM orders;
```
**Expect:** percent_filled = 100%

### Verify Index Created
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders' AND indexname LIKE '%restaurant%';
```
**Expect:** idx_orders_restaurant shown

### Verify Policies
```sql
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;
```
**Expect:** 5 policies listed

---

## 🔍 Troubleshooting

### Problem: restaurant_id IS NULL for existing orders

**Cause:** Step 2 didn't populate the column

**Solution 1:** If one restaurant per user
```sql
UPDATE orders
SET restaurant_id = (
  SELECT id FROM restaurants 
  WHERE business_user_id = orders.business_id
  LIMIT 1
)
WHERE restaurant_id IS NULL;
```

**Solution 2:** If multiple restaurants, manually assign
```sql
UPDATE orders 
SET restaurant_id = 'uuid-of-restaurant'
WHERE business_id = 'uuid-of-business-user'
AND restaurant_id IS NULL;
```

### Problem: Orders not showing after migration

**Cause:** RLS policy not matching

**Debug:** Check if restaurant_id is set
```sql
SELECT id, restaurant_id, business_id FROM orders LIMIT 5;
```

**Debug:** Verify restaurant relationship
```sql
SELECT o.id, o.restaurant_id, r.id, r.business_user_id
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_id = r.id
LIMIT 5;
```

### Problem: RLS policy shows "permission denied"

**Cause:** User doesn't own the restaurant

**Verify:** Check user's restaurants
```sql
SELECT id, business_user_id FROM restaurants
WHERE business_user_id = 'current-user-uuid';
```

---

## 📈 Performance Notes

### Before Optimization
```
SELECT * FROM orders → slow without proper filtering
```

### After Optimization
```
SELECT * FROM orders WHERE restaurant_id = 'uuid'
├─ Uses: idx_orders_restaurant index
└─ Time: < 1ms
```

### Index Explanation
- Index on restaurant_id speeds up RLS evaluation
- RLS subquery: `WHERE restaurants.id = orders.restaurant_id`
- Index lookup: O(log n) instead of O(n)

---

## ✅ Success Criteria

✅ restaurant_id column added  
✅ Existing orders linked to restaurants  
✅ New RLS policies deployed  
✅ Application code updated  
✅ All tests pass  
✅ Business users isolated by restaurant  
✅ Customers see all their orders  
✅ No performance degradation  

---

## 📞 Support

If you encounter issues:

1. Check troubleshooting section
2. Review BUSINESS_USER_ORDER_ISOLATION_GUIDE.md
3. Check Supabase logs for RLS violations
4. Verify restaurant_id is populated
5. Test RLS policies directly

---

## 🎉 Migration Complete

Once you've completed all steps:

✅ **Database:** Supports restaurant-based isolation  
✅ **Security:** RLS policies enforce authorization  
✅ **Data:** All orders properly categorized  
✅ **Application:** Using new restaurant_id field  
✅ **Testing:** Verified and working  

---

**Migration Date:** April 5, 2026
**Type:** Schema and RLS Update
**Compatibility:** Backward compatible (business_id preserved)
**Downtime:** Minimal (seconds)
**Rollback Time:** ~5 minutes
**Status:** ✅ READY FOR DEPLOYMENT

