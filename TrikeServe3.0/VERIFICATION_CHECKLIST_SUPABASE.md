# Supabase Orders Migration - Verification Checklist

## Code Changes Verification

### ✅ BusinessSidebar.tsx
- [x] Import `supabase` added
- [x] `loadPendingOrdersCount()` changed from async to async (was sync)
- [x] Query changed from localStorage to Supabase
- [x] Uses correct query: `business_id` = currentUser.id
- [x] Filters by status: ['pending', 'preparing', 'ready', 'on-the-way']
- [x] Error handling implemented
- [x] Console logs updated to reference Supabase

### ✅ Cart.tsx  
- [x] Business notification localStorage code REMOVED
- [x] No `businessNotificationKey` variable
- [x] No `localStorage.getItem(businessNotificationKey)`
- [x] No `localStorage.setItem(businessNotificationKey, ...)`
- [x] Added comment: "SUPABASE: Business user will see the order through Supabase real-time updates"
- [x] Console logs explain new behavior

### ✅ BusinessOrders.tsx
- [x] `localStorage.setItem(businessOrdersKey, ...)` REMOVED (was after updateOrderStatus)
- [x] Customer order updates localStorage REMOVED
- [x] Customer notifications localStorage REMOVED  
- [x] All `customerOrdersKey` and `customerNotificationsKey` references removed
- [x] Updated comments reflect "SUPABASE IS NOW THE SINGLE SOURCE OF TRUTH"
- [x] Console logs properly explain new behavior

## Functional Testing

### Order Creation Flow
- [ ] Place order as customer
- [ ] Order appears in business user's BusinessOrders view
- [ ] Order number matches
- [ ] Customer details correct
- [ ] Items and total correct
- [ ] Order shows status as "pending"

### Pending Order Count
- [ ] BusinessSidebar shows correct pending count
- [ ] Count updates when new order placed (within 3 seconds)
- [ ] Count decreases when order marked as delivered/cancelled
- [ ] Count same on multiple tabs (test in new window)

### Order Status Updates
- [ ] Change order status from pending → preparing
- [ ] Status saved to Supabase correctly
- [ ] No localStorage entries created
- [ ] Change order status from preparing → ready
- [ ] Change order status from ready → on-the-way
- [ ] Change order status from on-the-way → delivered
- [ ] Can also mark orders as cancelled

### Multi-Tab Testing
- [ ] Open BusinessOrders in Tab A
- [ ] Open BusinessOrders in Tab B
- [ ] Place order in Cart (new window)
- [ ] Order appears in Tab A
- [ ] Order appears in Tab B
- [ ] Both tabs show same pending count

### LocalStorage Verification
- [ ] Open Browser DevTools → Application → Local Storage
- [ ] Search for "business_orders_" → Should NOT exist
- [ ] Search for "notifications_" → Should NOT exist (for orders)
- [ ] Only `trikeserve_current_user` should exist
- [ ] No order data in localStorage

## Database Verification (Supabase Dashboard)

### Orders Table
- [ ] New orders appear in `orders` table
- [ ] `order_number` is unique
- [ ] `business_id` matches restaurant owner
- [ ] `customer_id` matches customer user
- [ ] `status` field updates correctly
- [ ] `created_at` timestamp is correct
- [ ] `updated_at` updates when status changes
- [ ] All fields populated correctly

### Order Processing Table  
- [ ] Processing record created for each order
- [ ] Links to correct order via `order_id`
- [ ] `restaurant_id` populated correctly
- [ ] `status` defaults to 'received'

## Console Log Verification

When placing order, should see:
```
[Cart] Order created with: {orderNumber, restaurantEmail, ...}
[Cart] Saving order to Supabase: ORDER_NUMBER
[Cart] With customer_id: USER_ID
[Cart] With business_id: BUSINESS_USER_ID
[Cart] ✅ Order saved successfully to Supabase
[Cart] Order sent to business user via Supabase
[Cart] Business user will receive real-time update from order_number: ORDER_NUMBER
```

When business user loads orders:
```
[BusinessOrders] Current user: {email, id, restaurantId, role}
[BusinessOrders] Fetching orders from Supabase for business user: USER_ID
[BusinessOrders] Loaded X orders from Supabase
[BusinessOrders] SECURITY: These orders are protected by RLS policies
```

When business user updates order status:
```
[BusinessOrders] Updating order status: ORDER_ID to: preparing
[BusinessOrders] Business key (no longer used for persistence): business_orders_...
[BusinessOrders] Syncing order status to Supabase...
[BusinessOrders] Saving to Supabase database...
[BusinessOrders] Updating order in Supabase: ORDER_NUMBER
[BusinessOrders] Order status saved to Supabase successfully
[BusinessOrders] Order status updated in Supabase - customers will see update in real-time
```

When business sidebar loads:
```
[BusinessSidebar] Error fetching orders from Supabase (if error)
OR no error = query successful
Pending count shows correct number
```

## Regression Testing

### Order Delivery Requests (if applicable)
- [ ] Can still book rides for ready orders
- [ ] Delivery request works correctly
- [ ] No localStorage errors

### Order History
- [ ] Past orders still display correctly
- [ ] Order filters work (pending, preparing, etc.)
- [ ] Order search functions

### Payment Processing
- [ ] Payment method saved correctly (cash/gcash)
- [ ] Order total calculated correctly
- [ ] Delivery fees applied correctly

## Performance Checks

- [ ] Page loads within acceptable time (<2 seconds)
- [ ] Auto-refresh (3 seconds) doesn't cause lag
- [ ] Switching between orders is smooth
- [ ] UI doesn't stutter when updating status
- [ ] Multiple orders display without performance issues

## Edge Cases

- [ ] Placing order with no items → Should fail gracefully
- [ ] Updating status of non-existent order → Should handle error
- [ ] Business user with no restaurant → Should show empty list
- [ ] Network disconnect → Should show error, not infinite load
- [ ] Session expires → Should prompt re-login
- [ ] Multiple simultaneous status updates → Should not conflict

## Browser Compatibility

- [ ] Chrome → Works correctly
- [ ] Firefox → Works correctly  
- [ ] Safari → Works correctly
- [ ] Edge → Works correctly

## Deployment Verification

### Pre-Deployment
- [ ] All code changes reviewed
- [ ] No console errors in development
- [ ] Tests pass
- [ ] Database migrations complete
- [ ] RLS policies verified

### Post-Deployment
- [ ] Test order placement on production
- [ ] Verify orders appear for business users
- [ ] Check status updates work
- [ ] Monitor error logs for issues
- [ ] Performance acceptable

## Rollback Plan

If critical issues found:
1. Revert changes to three files
2. Re-enable localStorage saves
3. Clear corrupted data
4. Redeploy with localStorage

**Never deploy on Friday afternoon!**

---

## Sign-Off

- [ ] Code review completed
- [ ] Tests passed
- [ ] QA verified functionality
- [ ] Performance acceptable
- [ ] Documentation updated
- [ ] Ready for deployment

**Reviewed By:** _______________  
**Date:** _______________  
**Status:** ✅ Ready / ❌ Needs Work

---

**Version:** 1.0  
**Last Updated:** April 5, 2026

