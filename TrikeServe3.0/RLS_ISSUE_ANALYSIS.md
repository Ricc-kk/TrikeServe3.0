# RLS SECURITY ISSUE - ROOT CAUSE ANALYSIS & FIX

## 🚨 CRITICAL ISSUE IDENTIFIED

**Orders from User A are visible to User B**

### Root Causes

#### Cause 1: NULL restaurant_id
- Orders created don't have `restaurant_id` properly populated
- The RLS policy relies on `restaurant_id` being set
- When `restaurant_id` IS NULL, the RLS condition fails
- **Result:** Order visible to all business users ❌

#### Cause 2: Mismatch in Field Names
- `Cart.tsx` sets `restaurant_id: order.restaurantEmail`
- `restaurantEmail` is a business email/UUID, not the Supabase restaurant.id
- Need to fetch the actual `restaurants.id` from Supabase
- **Result:** RLS policy can't match restaurant correctly ❌

#### Cause 3: Missing Supabase Integration
- Orders are saved to localStorage with `restaurantEmail`
- But Supabase orders table needs `restaurant_id` (Supabase restaurant UUID)
- The relationship might not exist in Supabase
- **Result:** RLS policy has no restaurant to match against ❌

---

## ✅ SOLUTIONS

### Solution 1: Immediate - Fix RLS Policy (Database)
Execute: **RLS_FIX_CRITICAL.sql**

This adds a fallback condition:
```sql
CASE 
  WHEN restaurant_id IS NOT NULL THEN
    -- Check restaurant ownership
    EXISTS (...)
  ELSE
    -- Fallback to business_id
    auth.uid()::text = business_id::text
END
```

**Effect:** Prevents data leakage while we fix the data

### Solution 2: Update Cart.tsx to Fetch restaurant_id
Need to query Supabase for the actual restaurant.id before creating order

### Solution 3: Ensure restaurant_id is Always Populated
Every order in Supabase must have a valid restaurant_id

---

## 🔍 DIAGNOSTIC QUERIES

### Run these in Supabase to diagnose:

```sql
-- 1. Check orders with NULL restaurant_id
SELECT COUNT(*) as total_orders,
       COUNT(restaurant_id) as with_restaurant_id,
       COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as null_restaurant_id
FROM orders;

-- 2. List orders without restaurant_id
SELECT id, order_number, business_id, restaurant_id, created_at
FROM orders
WHERE restaurant_id IS NULL
LIMIT 10;

-- 3. Check restaurant relationships
SELECT r.id, r.name, r.business_user_id, COUNT(o.id) as order_count
FROM restaurants r
LEFT JOIN orders o ON r.id = o.restaurant_id
GROUP BY r.id, r.name, r.business_user_id;

-- 4. Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'orders';
```

---

## 📋 STEP-BY-STEP FIX

### Step 1: Execute RLS_FIX_CRITICAL.sql (Immediate Protection)
```
In Supabase SQL Editor:
1. Copy RLS_FIX_CRITICAL.sql
2. Execute
3. Wait for completion
✅ Immediate fix applied
```

### Step 2: Update Cart.tsx (Application Level)
Need to:
1. When placing order, get the actual Supabase restaurant.id
2. Set that as restaurant_id in the orders table
3. Ensure business_id is set from user data

### Step 3: Verify Data in Supabase
```sql
-- Run diagnostic queries above
-- Confirm no orders with NULL restaurant_id
```

### Step 4: Test
```
1. Login as Business User A
2. Create order at Restaurant A
3. Check: User A sees order ✅
4. Logout, Login as Business User B
5. Check: User B does NOT see order ❌
✅ RLS working correctly
```

---

## 🛠️ CART.TSX MODIFICATION NEEDED

### Current Code (Problematic)
```typescript
const order = {
  // ...
  restaurantEmail: checkoutRestaurant.id,  // Business UUID
  // ...
};

// Saving to Supabase
const { data: savedOrder, error } = await supabase
  .from('orders')
  .insert([{
    restaurant_id: order.restaurantEmail,  // WRONG: This is not restaurant.id
    // ...
  }]);
```

### Fixed Code (Needed)
```typescript
// Get the actual restaurant record for this business
const businessUser = checkoutRestaurant.businessUserId; // Get from restaurant data
const { data: restaurantRecord } = await supabase
  .from('restaurants')
  .select('id')
  .eq('business_user_id', businessUser)
  .single();

const order = {
  // ...
  restaurantEmail: checkoutRestaurant.id,  // Business UUID (keep for localStorage)
  restaurantId: restaurantRecord?.id,      // Actual Supabase restaurant.id (NEW!)
  // ...
};

// Saving to Supabase
const { data: savedOrder, error } = await supabase
  .from('orders')
  .insert([{
    restaurant_id: order.restaurantId,    // CORRECT: Use actual restaurant.id
    customer_id: currentUser.id,          // Use Supabase user ID
    business_id: businessUser,            // Use Supabase business user ID
    // ... other fields
  }]);
```

---

## 🔐 COMPLETE SECURITY FIX

### The Flow (After Fix)

```
Customer places order at Restaurant A
    ↓
Application gets restaurant.id from Supabase
    ↓
Order created with:
├─ customer_id = current user's Supabase ID
├─ business_id = restaurant owner's Supabase ID
├─ restaurant_id = Supabase restaurant.id (KEY!)
└─ status = pending
    ↓
Saved to Supabase orders table
    ↓
Business User B queries orders
    ↓
RLS Policy Executes:
- Does User B own the restaurant? NO
- Result: Order HIDDEN ✅
    ↓
Business User A queries orders
    ↓
RLS Policy Executes:
- Does User A own the restaurant? YES
- Result: Order SHOWN ✅
```

---

## 📊 VERIFICATION CHECKLIST

After applying fixes:

- [ ] Execute RLS_FIX_CRITICAL.sql in Supabase
- [ ] Run diagnostic queries to check restaurant_id status
- [ ] Verify no orders have NULL restaurant_id
- [ ] Update Cart.tsx to fetch restaurant.id
- [ ] Create new test order
- [ ] Verify order has restaurant_id populated
- [ ] Login as User A → See order ✅
- [ ] Login as User B → Don't see order ✅
- [ ] Login as Customer → See order ✅
- [ ] Check browser console for any errors
- [ ] Monitor Supabase logs

---

## ⚡ QUICK FIXES (Priority Order)

### PRIORITY 1: Immediate (5 minutes)
1. Execute: RLS_FIX_CRITICAL.sql
2. Effect: Fallback RLS policy prevents further data leakage
3. Status: Temporary fix, data still vulnerable

### PRIORITY 2: High (30 minutes)
1. Update Cart.tsx to fetch restaurant.id
2. Ensure all NEW orders have restaurant_id
3. Populate NULL restaurant_id for existing orders

### PRIORITY 3: Medium (1 hour)
1. Comprehensive testing
2. Monitor for any remaining issues
3. Document changes

---

## 📝 NOTES

### Why This Happened
- RLS policies were designed assuming restaurant_id would always be set
- But application code doesn't guarantee this
- No validation on database level
- NULL values slip through

### What the Fix Does
1. **RLS Policy:** Adds fallback condition for backward compatibility
2. **Application:** Ensures restaurant_id is always populated
3. **Database:** Migrates NULL values to correct restaurant IDs

### Prevention Going Forward
1. Make restaurant_id NOT NULL in orders table
2. Add application-level validation
3. Add database constraint checks
4. Monitor RLS policy violations

---

## 🎯 EXPECTED OUTCOME

✅ Orders from User A are NOT visible to User B
✅ Orders from User B are NOT visible to User A
✅ Customers see only their orders
✅ RLS enforced at database level
✅ No data leakage possible
✅ Complete restaurant isolation

---

**Created:** April 5, 2026
**Severity:** CRITICAL (Data Leakage)
**Status:** Identified & Solution Provided
**Action Required:** IMMEDIATE (Deploy RLS_FIX_CRITICAL.sql)

