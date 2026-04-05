# Debugging Guide: Orders Not Showing in Business User Tab

## Issue
Orders are not appearing in the business user's order dashboard tab, even though they're being placed by customers.

---

## Root Cause Identified

### The Problem
There was a **key mismatch** in localStorage:

1. **Where Orders Were Saved** (in Cart.tsx via OrderContext):
   - Key: `business_orders_${restaurantEmail}` (restaurant UUID/ID)

2. **Where Orders Were Loaded** (in BusinessOrders.tsx):
   - Key: `business_orders_${userEmail}` (business user's email)

**Result:** Orders were saved to one location but BusinessOrders was looking in another!

---

## Fixes Applied

### Fix 1: Updated BusinessOrders.tsx
**File:** `src/app/components/business/BusinessOrders.tsx`

**What Changed:**
- ✅ Now checks for restaurant ID first (primary key)
- ✅ Falls back to user email for backward compatibility
- ✅ Added console logging to help debug
- ✅ Better error handling

**New Logic:**
```typescript
const restaurantId = currentUser.restaurantId || currentUser.id;
let businessOrdersKey = `business_orders_${restaurantId}`;
let savedOrders = localStorage.getItem(businessOrdersKey);

// If not found, try by email (backward compatibility)
if (!savedOrders) {
  businessOrdersKey = `business_orders_${currentUser.email}`;
  savedOrders = localStorage.getItem(businessOrdersKey);
}
```

### Fix 2: Enhanced Cart.tsx Logging
**File:** `src/app/components/customer/Cart.tsx`

**What Changed:**
- ✅ Added detailed logging of order creation
- ✅ Shows restaurant email being used
- ✅ Logs the localStorage key being used
- ✅ Helps identify any mismatches

**New Logs:**
```
[Cart] Order created with: {orderNumber, restaurantEmail, customerEmail, ...}
[Cart] Saving order to Supabase: ABC1234
[Cart] Order saved successfully to Supabase: {...}
[Cart] Business orders key would be: business_orders_[UUID]
```

---

## How to Debug

### Step 1: Check Browser Console
1. Open DevTools: `F12`
2. Go to Console tab
3. Place a test order as a customer
4. Look for these logs:
   - `[Cart] Order created with: {...}`
   - `[Cart] Order saved successfully`
   - `[Cart] Business orders key would be: business_orders_[UUID]`

### Step 2: Check LocalStorage
1. Open DevTools: `F12`
2. Go to Application → Local Storage
3. Search for the key shown in console logs (e.g., `business_orders_abc-123-uuid`)
4. Click on it and verify orders are there

### Step 3: Check Business Dashboard Logs
1. Login as business user
2. Go to Orders dashboard
3. Check console for these logs:
   - `[BusinessOrders] Looking for orders with...`
   - `[BusinessOrders] Found orders with...`
   - `[BusinessOrders] Loaded X orders`

### Step 4: Verify Current User Data
In console, run:
```javascript
JSON.parse(localStorage.getItem('trikeserve_current_user'))
```

Check that:
- `email` is set correctly
- `restaurantId` or `id` is set correctly
- `role` is 'business'

---

## Step-by-Step Test

### Test Case 1: Basic Order Flow

**Step 1:** Login as Customer
```
1. Go to /customer/food
2. Login with customer account
3. Verify email in console: 
   JSON.parse(localStorage.getItem('trikeserve_current_user')).email
```

**Step 2:** Place Order
```
1. Select restaurant
2. Add items
3. Go to cart
4. Checkout
5. Place order
6. Check console logs for [Cart] messages
7. Note the "business_orders_[UUID]" key mentioned
```

**Step 3:** Check Order Saved
```
In console, run:
const key = '[Key from Step 2]'; // e.g., business_orders_abc-123
JSON.parse(localStorage.getItem(key))
// Should show array with your order
```

**Step 4:** Login as Business User
```
1. Logout customer
2. Login with business account
3. Check console logs for [BusinessOrders] messages
4. Verify "Found orders with" message
```

**Step 5:** Check Orders Appear
```
1. Go to /business/orders
2. Orders should now appear!
3. Check console: "[BusinessOrders] Loaded X orders"
```

---

## Common Issues & Solutions

### Issue 1: Orders Show as Array but Don't Render
**Problem:** Orders are in localStorage but don't display in UI

**Solution:**
1. Check console for errors
2. Verify orders JSON is valid:
   ```javascript
   const data = JSON.parse(localStorage.getItem('business_orders_[UUID]'));
   console.log(data); // Check structure
   ```
3. Refresh page (Ctrl+F5)
4. Check if orders array is empty

### Issue 2: Different Email/ID Between Customer and Business
**Problem:** Customer places order but business user has different email

**Solution:**
1. Verify restaurant assignment:
   ```javascript
   // As customer
   const customer = JSON.parse(localStorage.getItem('trikeserve_current_user'));
   // Check what restaurantEmail they're sending
   
   // As business user
   const business = JSON.parse(localStorage.getItem('trikeserve_current_user'));
   // Check their email/id
   ```
2. Make sure checkout restaurant has correct ID
3. Verify restaurant is properly assigned to business user

### Issue 3: Business User Loaded Before Order Was Saved
**Problem:** Business user logged in before customer placed order

**Solution:**
- The app has 3-second auto-refresh in BusinessOrders
- Just wait 3 seconds or refresh page manually
- Orders should appear

---

## Verification Checklist

After fixes are applied, verify:

- [ ] Customer can place order
- [ ] Console shows `[Cart] Order saved successfully`
- [ ] Console shows `[Cart] Business orders key would be: business_orders_[ID]`
- [ ] That key exists in LocalStorage with order data
- [ ] Business user can see orders in dashboard
- [ ] Orders appear within 3 seconds or after refresh
- [ ] Order count shows in sidebar badge
- [ ] Can update order status
- [ ] Customer receives notifications

---

## Key Data Flow

```
CUSTOMER PLACES ORDER
    ↓
Cart.tsx: handlePlaceOrder()
    ↓
Creates order object with restaurantEmail (restaurant UUID)
    ↓
addOrder() in OrderContext
    ↓
Save to: business_orders_${restaurantEmail}
         (with restaurant UUID as key)
    ↓
BUSINESS USER LOADS DASHBOARD
    ↓
BusinessOrders.tsx: loadOrders()
    ↓
Get restaurantId from current user
    ↓
Load from: business_orders_${restaurantId}
    ↓
Orders appear in dashboard ✅
```

---

## Important Notes

### Restaurant Email vs Business User Email
- **Order Key:** `business_orders_${restaurant.id}` ← Restaurant UUID
- **Business User's Email:** Used for notifications
- **Customer's Email:** Used for their order tracking

These are THREE DIFFERENT things. Make sure each is used in the right place!

### LocalStorage Keys Used
```
orders_${customerEmail}                    // Customer's orders
business_orders_${restaurantId}            // Business's orders
notifications_${restaurantId}              // Business notifications
trikeserve_current_user                    // Current user data
```

### Auto-Refresh Timing
- **BusinessOrders:** Auto-refresh every 3 seconds
- **OrderContext:** Auto-refresh every 2 seconds
- Maximum wait: 3 seconds for orders to appear

---

## Logging Statements Added

### In Cart.tsx
```typescript
console.log('[Cart] Order created with: {...}');
console.log('[Cart] Saving order to Supabase: ABC1234');
console.log('[Cart] Order saved successfully to Supabase: {...}');
console.log('[Cart] Notification sent to business user with key: business_orders_[ID]');
console.log('[Cart] Business orders key would be: business_orders_[ID]');
console.error('[Cart] Error saving order: ...');
```

### In BusinessOrders.tsx
```typescript
console.log('[BusinessOrders] No current user data found');
console.log('[BusinessOrders] Looking for orders with email key: ...');
console.log('[BusinessOrders] Found orders with restaurant ID key: ...');
console.log('[BusinessOrders] Loaded X orders');
console.log('[BusinessOrders] No orders found in localStorage');
console.error('[BusinessOrders] Error parsing orders: ...');
```

---

## Next Steps

1. **Apply the fixes** (already done ✅)
2. **Clear localStorage** (to start fresh)
3. **Test the flow** using Step-by-Step Test above
4. **Check console logs** to verify each step
5. **Report any remaining issues** with console output

---

## Files Modified

| File | Changes |
|------|---------|
| `src/app/components/business/BusinessOrders.tsx` | Fixed loadOrders() function |
| `src/app/components/customer/Cart.tsx` | Added detailed logging |

---

## If Issues Persist

If orders still aren't showing after these fixes:

1. **Check restaurant assignment:**
   - Make sure business user has a restaurant assigned
   - Check if `restaurantId` is in their user data

2. **Check customer data:**
   - Make sure customer is logged in with correct email
   - Verify they're selecting the right restaurant

3. **Check localStorage keys match:**
   - Customer places order with `restaurantEmail: X`
   - Business user has `restaurantId: X`
   - These MUST match!

4. **Check console output:**
   - Look for error messages
   - Note exact keys being used
   - Share console logs for debugging

---

*Debugging Guide Updated: April 5, 2026*
*Status: Fixes Applied ✅*

