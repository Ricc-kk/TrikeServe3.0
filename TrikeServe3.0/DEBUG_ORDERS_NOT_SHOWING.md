# Debugging: Orders Not Showing in Business User Tab

## Enhanced Logging Added

I've added comprehensive logging to help diagnose why orders aren't appearing in the business dashboard.

---

## 🔍 How to Debug

### Step 1: Open Browser Console
1. Open DevTools: `F12`
2. Go to **Console** tab
3. Clear console: `console.clear()`

### Step 2: Place an Order as Customer
1. Login as customer
2. Go to `/customer/food`
3. Select restaurant
4. Add items
5. Checkout
6. Place order
7. **Check console immediately**

---

## 📊 Console Logs to Look For

### When Customer Places Order:

You should see these logs from **Cart.tsx**:
```
[Cart] Order created with: { ... }
[Cart] Business orders key would be: business_orders_[UUID]
[Cart] Order saved successfully to Supabase
[Cart] Processing record created successfully
```

Then from **OrderContext.tsx**:
```
[OrderContext] Adding order with restaurantEmail: [UUID]
[OrderContext] Saving to business key: business_orders_[UUID]
[OrderContext] Business orders count for this restaurant: 1
[OrderContext] Notification created for restaurant: notifications_[UUID]
```

**Important:** Note the `[UUID]` - this is the restaurant's ID. It should look like a UUID (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

### When Business User Logs In:

You should see from **BusinessOrders.tsx**:
```
[BusinessOrders] Current user data: {
  email: "restaurant@example.com",
  restaurantId: "[UUID or ID]",
  id: "[UUID or ID]",
  role: "business"
}
[BusinessOrders] Trying restaurant ID key: business_orders_[UUID]
[BusinessOrders] Found data: YES
[BusinessOrders] Loaded 1 orders
```

---

## 🐛 Troubleshooting

### Problem 1: No [Cart] logs appear
**Possible Cause:** Order not being placed through Cart
**Solution:**
1. Make sure you're using the checkout button
2. Check for JavaScript errors in console
3. Verify cart items are present

---

### Problem 2: [Cart] logs show, but NO [OrderContext] logs
**Possible Cause:** Order placed but addOrder() not called
**Solution:**
1. Check if you're navigating away immediately
2. Verify order is being added to cart context
3. Check for errors in Cart.tsx

---

### Problem 3: restaurantEmail is missing or null
**Problem Log:**
```
[OrderContext] Adding order with restaurantEmail: null
[OrderContext] Order has no restaurantEmail! Order: {...}
```

**Possible Cause:** Restaurant ID not set when creating order
**Solution:**
1. Verify `checkoutRestaurant` has an `id` field
2. Check that restaurant was properly selected
3. Look at order object to see what fields are present

---

### Problem 4: restaurantId doesn't match in business user
**Possible Cause:** Restaurant not properly assigned to business user
**Solution:**
1. Check if business user has `restaurantId` in profile
2. Verify it matches the restaurant the order was placed with
3. May need to update user profile with correct restaurant ID

---

### Problem 5: Orders found but wrong quantity
**Problem Log:**
```
[BusinessOrders] Loaded 5 orders (but only see 2)
```

**Possible Cause:** Some orders hidden by filter
**Solution:**
1. Check selected status filter in dashboard
2. Click "All" to see all active orders
3. Check "History" tab for completed orders

---

## 🔧 Manual Testing in Console

### Test 1: Check Customer Orders in localStorage
```javascript
// As customer, check your orders were saved
const customerEmail = JSON.parse(localStorage.getItem('trikeserve_current_user')).email;
const customerOrders = JSON.parse(localStorage.getItem(`orders_${customerEmail}`));
console.log('Customer orders:', customerOrders);
```

### Test 2: Check Business Orders Key
```javascript
// As customer, check business key was created
const order = JSON.parse(localStorage.getItem(`orders_${customerEmail}`))[0];
console.log('Order restaurantEmail:', order.restaurantEmail);
const businessKey = `business_orders_${order.restaurantEmail}`;
const businessOrders = JSON.parse(localStorage.getItem(businessKey));
console.log('Business orders:', businessOrders);
```

### Test 3: Check Current User Data
```javascript
// As business user, check your data
const currentUser = JSON.parse(localStorage.getItem('trikeserve_current_user'));
console.log('Current user:', currentUser);
console.log('Restaurant ID:', currentUser.restaurantId || currentUser.id);
```

### Test 4: Check All Business Orders Keys
```javascript
// See what business_orders keys exist
const allKeys = Object.keys(localStorage).filter(k => k.includes('business_orders'));
console.log('All business_orders keys:', allKeys);

// Check each key
allKeys.forEach(key => {
  const count = JSON.parse(localStorage.getItem(key)).length;
  console.log(`${key}: ${count} orders`);
});
```

---

## 📋 Checklist to Verify

### Customer Side
- [ ] Customer logs in with email
- [ ] Customer places order from /customer/food
- [ ] [Cart] logs appear in console
- [ ] [OrderContext] logs appear in console
- [ ] Order appears in /customer/activity
- [ ] restaurantEmail is a UUID (not email)

### Business Side
- [ ] Business user logs in with email
- [ ] Business user has restaurantId OR id field
- [ ] restaurantId/id should be a UUID
- [ ] [BusinessOrders] logs appear when loading orders
- [ ] Key being searched: `business_orders_${UUID}`
- [ ] UUID matches what customer order used

### Key Match
- [ ] Customer's order.restaurantEmail = Restaurant UUID
- [ ] Business user's restaurantId/id = Restaurant UUID
- [ ] Both sides use same UUID in business_orders key

---

## 🎯 Most Common Issues

### Issue 1: restaurantId Not Set on Business User
**Symptom:**
```
[BusinessOrders] Current user data: {
  restaurantId: undefined,
  id: "user-uuid"
}
```

**Fix:** Business user profile needs `restaurantId` field set to their restaurant UUID

---

### Issue 2: Restaurant ID Not UUID
**Symptom:**
```
[Cart] Business orders key would be: business_orders_undefined
[Cart] Business orders key would be: business_orders_null
```

**Fix:** Make sure `checkoutRestaurant.id` is actually set to restaurant UUID

---

### Issue 3: Wrong Order Total
**Symptom:** Order appears but with wrong amount
**Fix:** Check if multiple orders are being combined - verify order logic

---

## 📈 Expected Flow

```
CUSTOMER PLACES ORDER
        ↓
[Cart] Order created with: { restaurantEmail: "abc-123-uuid" }
        ↓
[OrderContext] Adding order with restaurantEmail: "abc-123-uuid"
        ↓
Saved to localStorage key: "business_orders_abc-123-uuid"
        ↓
BUSINESS USER LOGS IN
        ↓
[BusinessOrders] Current user: { restaurantId: "abc-123-uuid" }
        ↓
[BusinessOrders] Trying restaurant ID key: "business_orders_abc-123-uuid"
        ↓
[BusinessOrders] Found data: YES
        ↓
Orders appear in dashboard ✅
```

---

## 🆘 If Still Not Working

### Step 1: Collect Logs
1. Clear console
2. Place order as customer
3. Copy ALL console logs
4. Share them with developer

### Step 2: Collect Data
Run in console:
```javascript
console.log('=== CUSTOMER SIDE ===');
const custUser = JSON.parse(localStorage.getItem('trikeserve_current_user'));
console.log('Logged in as:', custUser.email);
const orders = JSON.parse(localStorage.getItem(`orders_${custUser.email}`)) || [];
console.log('Customer has orders:', orders.length);
if (orders.length > 0) {
  console.log('First order restaurant ID:', orders[0].restaurantEmail);
}

console.log('=== BUSINESS SIDE ===');
const bizUser = JSON.parse(localStorage.getItem('trikeserve_current_user'));
console.log('Logged in as:', bizUser.email);
console.log('Restaurant ID:', bizUser.restaurantId || bizUser.id);
const bizKey = `business_orders_${bizUser.restaurantId || bizUser.id}`;
const bizOrders = JSON.parse(localStorage.getItem(bizKey)) || [];
console.log('Business has orders:', bizOrders.length);

console.log('=== ALL BUSINESS ORDER KEYS ===');
Object.keys(localStorage).filter(k => k.includes('business_orders')).forEach(k => {
  console.log(k, ':', JSON.parse(localStorage.getItem(k)).length);
});
```

Copy this output and share

---

## ✅ Success Indicators

When working correctly:
- ✅ Console shows matching UUIDs
- ✅ Orders appear in activity tab immediately
- ✅ Same orders appear in business dashboard
- ✅ Order count badge in sidebar shows correct number
- ✅ Orders sync within 3 seconds

---

*Debug Guide Version: 1.0*
*Date: April 5, 2026*

