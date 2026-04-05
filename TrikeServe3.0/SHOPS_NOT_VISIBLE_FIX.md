# Shops/Restaurants Not Visible - Fix Applied

## The Problem
Shops were not visible on the customer home page because:
1. The system was only loading **verified** business users from localStorage
2. No business users had been created or verified
3. The Supabase `restaurants` table was empty

## The Solution Applied

### Code Updates
**FoodHome.tsx** has been updated to:
1. **Load from Supabase first** - Attempts to load restaurants from the Supabase `restaurants` table
2. **Fallback to localStorage** - If Supabase has no restaurants, loads from localStorage
3. **Auto-refresh** - Refreshes every 5 seconds to show newly created restaurants
4. **Console logging** - Shows what restaurants are being loaded for debugging

## How to Get Shops/Restaurants to Show

### Option 1: Create a Business Account (Recommended)

1. **Open the app**
2. **Go to Sign Up**
3. **Create a business account with:**
   - Email: `testbusiness@example.com`
   - Password: `password123`
   - Business Name: `Test Restaurant`
   - Business Address: `Tagalag, Valenzuela`
   - Role: `Business`

4. **After creating:**
   - The restaurant will appear in Supabase `restaurants` table
   - It will show on customer home page in 5 seconds

### Option 2: Manually Create Restaurants in Supabase

Run this SQL in Supabase:

```sql
-- Insert test restaurants
INSERT INTO restaurants (name, business_user_id, address, phone, rating, is_open, created_at)
VALUES 
  ('Kuya J Eatery', 'business-1', 'Tagalag, Valenzuela', '09171234567', 4.5, true, NOW()),
  ('Mang Tomas BBQ', 'business-2', 'Valenzuela City', '09171234568', 4.7, true, NOW()),
  ('Tagalag Carinderia', 'business-3', 'Barangay Tagalag', '09171234569', 4.3, true, NOW());

-- Verify
SELECT name, address, is_open FROM restaurants;
```

After running:
- Refresh customer home page
- ✅ Restaurants should appear!

### Option 3: Use Existing Business Users

If you have existing business users created:

1. **They need to be in the `restaurants` table**
2. **Run this to create restaurants from users:**

```sql
-- Create restaurants from verified business users
INSERT INTO restaurants (name, business_user_id, address, phone, rating, is_open, created_at)
SELECT 
  business_name,
  id,
  business_address,
  phone,
  5.0,
  true,
  NOW()
FROM users
WHERE role = 'business'
AND is_verified = true
ON CONFLICT DO NOTHING;
```

---

## What Changed in Code

### FoodHome.tsx

**Before:**
```typescript
const loadRestaurants = () => {
  const usersData = localStorage.getItem('trikeserve_users');
  // Only loaded verified users from localStorage
};
```

**After:**
```typescript
const loadRestaurantsFromSupabase = async () => {
  // Try Supabase first
  const { data: restaurants } = await supabase
    .from('restaurants')
    .select('*');
  
  if (restaurants && restaurants.length > 0) {
    // Use Supabase data
  } else {
    // Fallback to localStorage
    loadRestaurantsFromLocalStorage();
  }
};
```

**Benefits:**
- ✅ Can see restaurants created in Supabase
- ✅ Automatic fallback if Supabase unavailable
- ✅ Better logging for debugging
- ✅ Real-time refresh every 5 seconds

---

## Testing

### Test 1: Create a Business Account
1. Sign up as a business
2. Refresh customer home page
3. ✅ Your restaurant should appear in 5 seconds

### Test 2: Check Console Logs
1. F12 → Console
2. Look for: `[FoodHome] Loaded restaurants from Supabase: X`
3. This tells you how many restaurants are loading

### Test 3: Manual SQL Insert
1. Insert restaurants directly in Supabase SQL
2. Refresh customer home page
3. ✅ Should see restaurants!

---

## Verification Checklist

- [ ] At least one restaurant exists in Supabase `restaurants` table
- [ ] Customer home page shows restaurants
- [ ] Console shows: `[FoodHome] Loaded restaurants from Supabase`
- [ ] Restaurants have menu items
- [ ] Customer can click on restaurant to view menu

---

## Files Modified

- `src/app/components/customer/FoodHome.tsx` - Updated to load from Supabase

---

## Summary

Shops will now show if:
1. ✅ Restaurants exist in Supabase `restaurants` table
2. ✅ OR business users exist in localStorage with data

The system automatically tries Supabase first, then falls back to localStorage.

**To get restaurants to show: Create a business account or insert restaurants into Supabase.**

