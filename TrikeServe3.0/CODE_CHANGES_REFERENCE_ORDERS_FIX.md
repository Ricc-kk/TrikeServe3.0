# Code Changes Reference - Orders Fix

## File Modified
`src/app/components/customer/Cart.tsx`

---

## The Exact Change

### BEFORE (❌ Wrong Order)
```typescript
// Line 213
addOrder(order);  // ❌ Save to localStorage FIRST

// Then try Supabase (might fail)
try {
  const { data: savedOrder, error: insertError } = await supabase
    .from('orders')
    .insert([{...}])
    
  if (insertError) {
    console.error('Error:', insertError);  // Silent failure
    // ❌ Order already in localStorage, so no one knows it failed
  }
}
```

### AFTER (✅ Correct Order)
```typescript
// Try Supabase FIRST
try {
  console.log('[Cart] Saving order to Supabase:', order.orderNumber);
  
  const { data: savedOrder, error: insertError } = await supabase
    .from('orders')
    .insert([{
      customer_id: user?.id || null,
      business_id: businessUserId || null,
      order_number: order.orderNumber,
      restaurant_email: order.restaurantEmail || null,
      customer_email: order.customerEmail,
      customer_name: order.customerName,
      customer_phone: order.customerPhone,
      items: JSON.stringify(order.items),
      subtotal: order.subtotal,
      delivery_fee: order.deliveryFee,
      total: order.total,
      status: order.status,
      delivery_mode: order.deliveryMode,
      payment_method: order.paymentMethod,
      address: order.address,
      estimated_time: order.estimatedTime,
      needs_cutlery: order.needsCutlery,
      created_at: order.createdAt,
    }])
    .select()
    .single();

  if (insertError) {
    console.error('[Cart] Error saving order to Supabase:', insertError);
    alert('Error saving order: ' + (insertError?.message || 'Unknown error'));
    return;  // ✅ Stop here - don't save to localStorage
  } else {
    console.log('[Cart] ✅ Order saved successfully to Supabase:', savedOrder);
    
    // ✅ ONLY SAVE TO LOCALSTORAGE AFTER SUPABASE SUCCESS
    addOrder(order);
    
    // ... rest of code (processing, notifications, etc)
  }
}
```

---

## Key Points of the Fix

### 1. Order of Operations Changed
```
BEFORE: localStorage → Supabase
AFTER:  Supabase → localStorage
```

### 2. Error Handling Added
```typescript
if (insertError) {
  // ✅ Show user what went wrong
  alert('Error saving order: ' + (insertError?.message || 'Unknown error'));
  // ✅ Stop processing (return early)
  return;
}
```

### 3. addOrder() Moved Inside Success Block
```typescript
if (insertError) {
  // ❌ Error path - don't call addOrder()
  return;
} else {
  // ✅ Success path - only then call addOrder()
  addOrder(order);
}
```

### 4. Better Logging
```typescript
console.log('[Cart] ✅ Order saved successfully to Supabase:', savedOrder);
```

---

## Lines Changed
- **File:** `src/app/components/customer/Cart.tsx`
- **Function:** `handlePlaceOrder()`
- **Lines:** Approximately 210-260
- **Type of Change:** Code reordering + error handling

---

## What Each Part Does

### Supabase Insert (Main Save)
```typescript
const { data: savedOrder, error: insertError } = await supabase
  .from('orders')
  .insert([{
    // All order details mapped to database columns
  }])
  .select()
  .single();
```
**Purpose:** Save order to Supabase database (source of truth)

### Error Check
```typescript
if (insertError) {
  console.error('[Cart] Error saving order to Supabase:', insertError);
  alert('Error saving order: ' + (insertError?.message || 'Unknown error'));
  return;
}
```
**Purpose:** If Supabase fails, show error and stop

### Success Path
```typescript
else {
  console.log('[Cart] ✅ Order saved successfully to Supabase:', savedOrder);
  addOrder(order);  // Save to localStorage as backup
  
  // Create processing record
  // Send notifications
  // etc...
}
```
**Purpose:** If Supabase succeeds, save to localStorage and continue

---

## Why This Matters

### Before Fix
```
If Supabase fails:
  - Order still in localStorage
  - User doesn't know it failed
  - Database is empty
  - Data inconsistency ❌
```

### After Fix
```
If Supabase fails:
  - Error shown to user
  - Order NOT in localStorage
  - User can retry
  - No data inconsistency ✅

If Supabase succeeds:
  - Order in database ✅
  - Order in localStorage ✅
  - User sees confirmation
  - Data consistent ✅
```

---

## Test the Fix

### Create Test Order
```
npm run dev → Login → Add items → Checkout → Place order
```

### Watch Console
```
✅ [Cart] Saving order to Supabase: ABC123
✅ [Cart] With customer_id: [uuid]
✅ [Cart] ✅ Order saved successfully to Supabase: {...}
```

### Verify in Supabase
```sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 1;
```

---

## Related Functions

### OrderContext.addOrder()
```typescript
const addOrder = (order: Order) => {
  // Adds to local state
  setOrders((prev) => [order, ...prev]);
  
  // Saves to localStorage
  localStorage.setItem(ordersKey, JSON.stringify(orders));
  
  // Creates notifications
  // ...
}
```
**Purpose:** Manages localStorage and local state

### Cart.handlePlaceOrder()
```typescript
const handlePlaceOrder = async () => {
  // Try Supabase FIRST
  const { data, error } = await supabase.from('orders').insert([...]);
  
  if (error) {
    alert('Error: ' + error.message);
    return;  // Stop here
  }
  
  // THEN call addOrder for localStorage
  addOrder(order);
}
```
**Purpose:** Orchestrates the complete order flow

---

## Configuration Fields Being Sent

```typescript
{
  customer_id: user?.id || null,              // From useAuth()
  business_id: businessUserId || null,        // From Cart state
  order_number: order.orderNumber,            // Auto-generated
  restaurant_email: order.restaurantEmail,    // From checkoutRestaurant
  customer_email: order.customerEmail,        // From current user
  customer_name: order.customerName,          // From current user
  customer_phone: order.customerPhone,        // From current user
  items: JSON.stringify(order.items),         // Cart items
  subtotal: order.subtotal,                   // Calculated
  delivery_fee: order.deliveryFee,            // From selection
  total: order.total,                         // Calculated
  status: order.status,                       // "pending"
  delivery_mode: order.deliveryMode,          // "delivery" or "pickup"
  payment_method: order.paymentMethod,        // "cash" or "gcash"
  address: order.address,                     // Delivery address
  estimated_time: order.estimatedTime,        // From selection
  needs_cutlery: order.needsCutlery,          // User choice
  created_at: order.createdAt,                // ISO timestamp
}
```

---

## Status

✅ **Fix Applied**
✅ **Code Reviewed**
✅ **Ready to Test**

---

**Date:** April 5, 2026
**File:** `src/app/components/customer/Cart.tsx`
**Change Type:** Code reordering + error handling
**Impact:** Orders now save to database instead of just localStorage

