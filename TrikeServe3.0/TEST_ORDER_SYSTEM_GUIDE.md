# Quick Start Guide: Testing Customer Orders to Business User

## 🎯 Overview
This guide walks you through testing the complete order system where customers place orders and business users receive them.

---

## 📱 Step-by-Step Testing

### Phase 1: Setup (5 minutes)

#### Step 1: Start the Application
```bash
cd C:\Users\Mayo\Desktop\TrikeServe3.0\TrikeServe3.0
npm install (or pnpm install)
npm run dev (or pnpm dev)
```

#### Step 2: Open Two Browser Windows
- **Window 1:** Customer view (`http://localhost:5173`)
- **Window 2:** Business view (same URL, different user)

---

### Phase 2: Customer Places Order (5 minutes)

#### In Window 1 (Customer):

1. **Login as Customer**
   - Email: `customer@example.com`
   - Password: `password123`
   - Click "Login"

2. **Browse Food**
   - Click "Food" or "Explore"
   - Select a restaurant (e.g., "Jollibee", "McDonald's")

3. **Add Items to Cart**
   - Click on any menu item (e.g., "Lechon Kawali")
   - Click "+" to add quantity
   - Click "Add to Cart"
   - Add 2-3 different items

4. **Review Cart**
   - Click cart icon (🛒) in navigation
   - See all items with prices
   - See subtotal

5. **Proceed to Checkout**
   - Scroll down
   - Click "Checkout" button
   - Select delivery address (default is fine)
   - Select delivery option (Standard, Priority, or Saver)
   - Select payment method (Cash or GCash)

6. **Place Order**
   - Click "Place Order"
   - **✅ Success!** - Confirmation modal appears with order number (e.g., "ABC1234")
   - Note the order number
   - Click "View Order" to see order details

---

### Phase 3: Business Receives Order (5 minutes)

#### In Window 2 (Business):

1. **Login as Business User**
   - Email: `business@example.com` (or the restaurant's email)
   - Password: `password123`
   - Click "Login"

2. **Navigate to Orders Dashboard**
   - Click "Orders" in sidebar
   - Or go to `/business/orders` directly

3. **Verify Order Received**
   - ✅ See the new order appear (within 3 seconds)
   - ✅ Order number matches what customer saw
   - ✅ Shows "New Order" badge (orange)
   - ✅ Shows customer name
   - ✅ Shows total amount
   - ✅ Shows delivery address
   - ✅ Status shows "Pending"

4. **Click on Order**
   - Click the order card
   - See all order details:
     - Customer name, phone, email
     - Delivery address
     - Items ordered with quantities and prices
     - Subtotal, delivery fee, total
     - Payment method
     - Estimated time

---

### Phase 4: Business Updates Order Status (5 minutes)

#### In Window 2 (Business):

1. **Accept Order**
   - Click "Accept Order" or status button
   - Select "Preparing" status
   - Order status changes from orange (Pending) to blue (Preparing)

2. **Prepare Order**
   - Simulate order preparation
   - After a few seconds, click the order again
   - Update status to "Ready"
   - Order status changes to green (Ready)

3. **Ready for Delivery**
   - Order now appears in "Ready" section
   - You can select it and "Book Ride for Delivery"
   - (Or mark as "On The Way" for pickup)

4. **Complete Delivery**
   - Update status to "On The Way" (if booking rider)
   - Then update to "Delivered"
   - Order moves from "Active" to "History" tab

---

### Phase 5: Verify Customer Gets Updates (5 minutes)

#### Back to Window 1 (Customer):

1. **Check Order Status in Real-Time**
   - Go to "Orders" section
   - Or click "View Order" from confirmation
   - ✅ Status updates as business user changes it
   - ✅ See notification updates:
     - 🍽️ "Order is being prepared"
     - 🚴 "Order is ready for pickup"
     - 🛵 "Order is on the way"
     - ✅ "Order has been delivered"

2. **Verify Notifications**
   - Check notification center (bell icon)
   - ✅ See all status change notifications
   - Each notification timestamped and clickable

3. **Order History**
   - After order completes
   - Order moves to "Order History"
   - Shows with ✅ "Delivered" badge

---

## 🔍 Verification Checklist

### ✅ Order Placement
- [ ] Customer can place order from cart
- [ ] Order number is displayed
- [ ] Confirmation modal appears
- [ ] Order shows in customer's "Orders" section

### ✅ Business Receives Order
- [ ] Order appears in business dashboard
- [ ] Shows correct order number
- [ ] Shows customer name
- [ ] Shows correct total amount
- [ ] Shows "Pending" status
- [ ] Appears within 3 seconds of placement

### ✅ Order Details
- [ ] All items are listed correctly
- [ ] Quantities are correct
- [ ] Prices are correct
- [ ] Subtotal calculation is correct
- [ ] Delivery fee is correct
- [ ] Total is correct
- [ ] Delivery address is correct
- [ ] Payment method is shown
- [ ] Customer phone is displayed

### ✅ Status Updates
- [ ] Business can update status to "Preparing"
- [ ] Status changes immediately in business view
- [ ] Status updates in customer view within 2 seconds
- [ ] Business can update to "Ready"
- [ ] Business can update to "On The Way"
- [ ] Business can update to "Delivered"

### ✅ Notifications
- [ ] Customer gets notification when status changes
- [ ] Notification shows in notification center
- [ ] Notification is clickable and links to order
- [ ] Notification includes relevant information

### ✅ Order History
- [ ] Completed order moves to "History" tab
- [ ] History order shows with "Delivered" badge
- [ ] Can see all past orders in history

---

## 🛠️ Troubleshooting

### Issue: Order doesn't appear in business dashboard

**Solution:**
1. Check that business user is logged in
2. Verify business user's email matches restaurant owner email
3. Manually refresh the page (F5)
4. Check browser console for errors
5. Verify Supabase is running and connected

### Issue: Status update doesn't sync to customer

**Solution:**
1. Wait 2-3 seconds (polling interval)
2. Refresh customer's order page
3. Check that both users are logged in with correct accounts
4. Verify localStorage isn't full (clear old data if needed)

### Issue: Notification not showing

**Solution:**
1. Check notification center (bell icon)
2. Verify email is correct in localStorage
3. Check browser console for errors
4. Manually refresh order detail page

### Issue: Order number is missing

**Solution:**
1. Check that order was fully saved
2. Look in browser console for "[Cart] Order saved successfully"
3. Verify no errors in Supabase insertion
4. Try placing order again

---

## 📊 Data to Check in Browser DevTools

### Open Browser Console:
```
F12 → Application → Local Storage
```

### Look for these keys:

#### 1. Customer Orders
**Key:** `orders_customer@example.com`
**Content:** Array of order objects with:
- id, orderNumber, restaurantName, customerEmail
- items, total, status, deliveryMode
- address, date, createdAt

#### 2. Business Orders
**Key:** `business_orders_business@example.com`
**Content:** Same order objects (mirrors customer orders)

#### 3. Business Notifications
**Key:** `notifications_business@example.com`
**Content:** Array of notification objects:
```json
{
  "id": "order-1234567890123",
  "type": "order",
  "title": "New Order Received!",
  "message": "New order #ABC1234 from John Doe. Total: ₱500",
  "timestamp": 1712282400000,
  "unread": true,
  "icon": "🛒",
  "orderId": "1234567890123",
  "actionUrl": "/business/orders"
}
```

#### 4. Current User Info
**Key:** `trikeserve_current_user`
**Content:** Current logged-in user's profile

---

## 🎯 Expected Timeline

| Step | Time | Action | Expected Result |
|------|------|--------|-----------------|
| 1 | 0s | Customer places order | Confirmation shown |
| 2 | 0-3s | Order syncs to business | Order appears in dashboard |
| 3 | 5s | Business accepts order | Status changes to "Preparing" |
| 4 | 2s | Customer checks status | Status updates in real-time |
| 5 | 5s | Business marks ready | Status changes to "Ready" |
| 6 | 2s | Customer sees update | Notification appears |
| 7 | 5s | Business marks delivered | Status changes to "Delivered" |
| 8 | 2s | Order moves to history | Appears in History tab |

---

## 📝 Test Scenarios

### Scenario 1: Single Item Order
- Customer orders 1 Lechon Kawali
- Business confirms
- Order completes

### Scenario 2: Multiple Items Order
- Customer orders 3 different items from same restaurant
- Business prepares all items
- Order completes

### Scenario 3: Multiple Restaurants
- Customer adds items from different restaurants
- Places separate orders
- Each business receives their respective order

### Scenario 4: Pickup vs Delivery
- Test with delivery mode selected
- Test with pickup mode selected
- Verify both work correctly

### Scenario 5: Different Payment Methods
- Test with Cash payment
- Test with GCash payment
- Verify payment method is saved

---

## ✨ Advanced Testing

### Test Real-Time Sync
1. Place order in Window 1
2. Don't refresh Window 2
3. Watch order appear in 1-3 seconds
4. Update status in Window 2
5. Watch status update in Window 1 in 1-2 seconds

### Test Multiple Devices
1. Login to customer account on phone/tablet
2. Place order from customer account on laptop
3. Open business dashboard on another device
4. All devices should see the same data

### Test Data Persistence
1. Place order
2. Close browser completely
3. Reopen and login
4. Orders should still be there (from Supabase and localStorage)

### Test Error Recovery
1. Disconnect internet while placing order
2. Reconnect
3. Order should eventually sync to Supabase
4. Check console logs for recovery attempts

---

## 📞 Support

If you encounter issues:

1. **Check console logs:**
   ```
   F12 → Console → Look for [Cart] messages
   ```

2. **Check localStorage:**
   ```
   F12 → Application → Local Storage → Search for orders_
   ```

3. **Check Supabase:**
   - Go to Supabase dashboard
   - Tables → orders
   - Verify orders were inserted

4. **Check network:**
   ```
   F12 → Network → Look for Supabase requests
   ```

---

## ✅ Sign-Off Checklist

After testing, verify:
- [ ] Customer can place orders
- [ ] Business receives orders
- [ ] Status updates sync correctly
- [ ] Notifications appear on both sides
- [ ] Order history works
- [ ] Data persists across sessions
- [ ] Multiple restaurants work
- [ ] Payment methods are saved
- [ ] Delivery addresses are saved
- [ ] All calculations are correct

**If all items are checked, the system is working correctly! ✅**

