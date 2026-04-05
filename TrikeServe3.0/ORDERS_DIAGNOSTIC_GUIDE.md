# Business Orders Not Showing - Diagnostic Guide

## Current Issue

Orders are being saved to Supabase but **not showing in BusinessOrders** because:
- The `business_id` value saved in the order doesn't match the logged-in business user's ID

## How to Debug

### Step 1: Check What's Being Saved
1. **Open DevTools** (F12)
2. **Go to Console tab**
3. **Place a test order** as a customer
4. **Look for this log:**
   ```
   [Cart] ========== ORDER SAVE DEBUG ==========
   [Cart] Restaurant object: { id: "...", name: "...", businessUserId: "..." }
   [Cart] With business_id: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   [Cart] ======================================
   ```
5. **Copy the business_id value** - this is what was SAVED

### Step 2: Check What's Being Queried
1. **Log in as the business user**
2. **Go to Orders tab**
3. **Check console again for:**
   ```
   [BusinessOrders] ========== ORDER LOAD DEBUG ==========
   [BusinessOrders] Current user ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   [BusinessOrders] Current user email: business@example.com
   [BusinessOrders] Business restaurant ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   [BusinessOrders] ======================================
   ```
4. **Copy the Current user ID** - this is what it's LOOKING FOR

### Step 3: Compare IDs

**DO THESE MATCH?**

```
business_id (SAVED in Step 1):  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
Current user ID (QUERIED Step 2): xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

If different = This is your problem!
```

### Step 4: Check the Database Directly

1. **Go to Supabase Dashboard**
2. **SQL Editor**
3. **Run this query:**
   ```sql
   SELECT id, order_number, business_id, customer_name, created_at 
   FROM orders 
   ORDER BY created_at DESC 
   LIMIT 5;
   ```
4. **Look at the business_id column** - what values are there?

5. **Compare with business user ID:**
   ```sql
   SELECT id, email, role 
   FROM auth.users 
   WHERE role = 'business' 
   LIMIT 5;
   ```

6. **Do any order business_id values match a user's id?**

## Most Likely Problems

### Problem 1: businessUserId is undefined/null
**Symptom:** Console shows `[Cart] With business_id: null`

**Cause:** Restaurant object doesn't have businessUserId field

**Fix:**
- Make sure FoodHome.tsx passes businessUserId
- Make sure RestaurantDetail.tsx passes businessUserId
- Refresh browser to load new code

### Problem 2: businessUserId is wrong UUID
**Symptom:** IDs don't match between save and query

**Cause:** Restaurant's business_user_id in Supabase is wrong

**Fix:**
- Check restaurants table: does business_user_id match the actual owner's ID?
- May need to update restaurants table with correct business_user_id

### Problem 3: Stored User ID is Different
**Symptom:** currentUser.id in BusinessOrders is different from original

**Cause:** localStorage data is outdated or incorrect

**Fix:**
- **Log out completely** (clear browser data)
- **Log in again fresh**
- Check that currentUser.id is correct in localStorage

## To Verify Your Fix Works

Once you've fixed the ID mismatch:

1. **Place an order** as customer
2. **Log in as business user**
3. **Look for console message:**
   ```
   [BusinessOrders] ✅ Found 1 order(s)
   ```
4. **NOT this message:**
   ```
   [BusinessOrders] ℹ️  No orders found
   ```

## Quick Debug Checklist

- [ ] Place test order
- [ ] Check `[Cart]` logs - note business_id value
- [ ] Log in as business user
- [ ] Check `[BusinessOrders]` logs - note Current user ID
- [ ] Do they match?
  - [ ] YES → Works! Check for other issues
  - [ ] NO → See "Most Likely Problems" above
- [ ] Check Supabase database directly
- [ ] Verify orders were actually inserted
- [ ] Verify business_user_id in restaurants table is correct

## Still Not Working?

**Check these in order:**

1. **Are you logged in as the same business user who owns the restaurant?**
   - Wrong business account = orders won't show

2. **Is the restaurant actually linked to this business user in Supabase?**
   - Check: restaurants table → business_user_id

3. **Was the order actually saved to Supabase?**
   - Check: orders table → look for your test order

4. **Does the order have the correct business_id?**
   - If not, someone else's ID was saved

5. **Is there an RLS policy blocking access?**
   - Error message would be: "403 Forbidden" or "row level security"

## Console Messages Reference

| Message | Meaning |
|---------|---------|
| `[Cart] With business_id: UUID` | Order being saved with this ID |
| `[BusinessOrders] Current user ID: UUID` | Business user logged in with this ID |
| `[BusinessOrders] ✅ Found X order(s)` | ✅ Orders found! |
| `[BusinessOrders] ℹ️  No orders found` | No match found - IDs don't match |
| `[BusinessOrders] ❌ Error fetching orders` | Database error or RLS blocked |

---

**Need Help?** 
1. Run through the diagnostic steps above
2. Share the ID values from console logs
3. Share what error message you see (if any)

