# Fix: Restaurant Name Showing as UUID on Reload

## Problem
Activity tab shows UUID (61c48565-1d03-477f-9a20-29ccc318cc02) instead of restaurant name after reload.

## Root Cause
- Restaurant name was in order object but NOT saved to Supabase
- On reload, Activity component had no way to get the actual restaurant name
- Fell back to `restaurant_email` which contains the UUID

## Solution

### Step 1: Add restaurant_name Column to Database

Run this SQL in Supabase:

```sql
ALTER TABLE orders ADD COLUMN restaurant_name VARCHAR(255);
UPDATE orders SET restaurant_name = restaurant_email WHERE restaurant_name IS NULL;
```

### Step 2: Update Code (Already Done ✅)

**Cart.tsx** - Now saves restaurant_name:
```typescript
restaurant_name: order.restaurantName || null,
```

**Activity.tsx** - Now reads restaurant_name from database:
```typescript
restaurantName: dbOrder.restaurant_name || matchingLocalOrder?.restaurantName || 'Restaurant',
```

---

## How It Works Now

```
Order Created
    ↓
restaurantName saved to Supabase ✅
    ↓
Page Reloaded
    ↓
Activity fetches from database
    ↓
Uses dbOrder.restaurant_name (actual name) ✅
    ↓
Shows proper restaurant name instead of UUID ✅
```

---

## Testing

1. **Run the SQL** (add restaurant_name column)
2. **Create new order** → Restaurant name will be saved
3. **Reload page** → Should show restaurant name, not UUID

---

## For Existing Orders

Existing orders will show UUID until the column is added. New orders created after the column is added will show proper names.

To fix existing orders:
```sql
-- Look up restaurant names from somewhere (if available)
-- Or ask users to place new orders
```

---

## Status

- ✅ Code updated to save restaurant_name
- ✅ Code updated to read restaurant_name
- ⏭️ Need to run SQL to add column

