# Create Restaurants for Existing Business Users

## What This Does
Creates restaurant records in Supabase for any existing business users that don't have a restaurant yet.

## How to Use

### Step 1: Check Existing Business Users
First, see what business users exist in Supabase:

```sql
SELECT id, email, name, business_name, business_address 
FROM users 
WHERE role = 'business'
ORDER BY created_at;
```

If this returns results, you have business users with data ready to be converted to restaurants.

### Step 2: Create Restaurants from Business Users

```sql
INSERT INTO restaurants (name, business_user_id, address, phone, rating, is_open, created_at, updated_at)
SELECT 
  COALESCE(u.business_name, u.name, 'Restaurant') as name,
  u.id as business_user_id,
  u.business_address as address,
  u.phone,
  5.0 as rating,
  true as is_open,
  NOW() as created_at,
  NOW() as updated_at
FROM users u
WHERE u.role = 'business'
AND u.id NOT IN (SELECT business_user_id FROM restaurants)
ON CONFLICT (business_user_id) DO NOTHING;
```

This will:
- ✅ Create a restaurant for each business user
- ✅ Use their business name if available
- ✅ Use their business address
- ✅ Skip if restaurant already exists
- ✅ Set is_open to true so they appear

### Step 3: Verify Restaurants Were Created

```sql
SELECT r.id, r.name, r.business_user_id, r.address, r.is_open
FROM restaurants r
ORDER BY r.created_at DESC;
```

## Complete SQL (All Steps)

Copy and run this entire script in Supabase SQL Editor:

```sql
-- Check business users
SELECT id, email, name, business_name, business_address 
FROM users 
WHERE role = 'business'
ORDER BY created_at;

-- Create restaurants for business users
INSERT INTO restaurants (name, business_user_id, address, phone, rating, is_open, created_at, updated_at)
SELECT 
  COALESCE(u.business_name, u.name, 'Restaurant') as name,
  u.id as business_user_id,
  u.business_address as address,
  u.phone,
  5.0 as rating,
  true as is_open,
  NOW() as created_at,
  NOW() as updated_at
FROM users u
WHERE u.role = 'business'
AND u.id NOT IN (SELECT business_user_id FROM restaurants)
ON CONFLICT (business_user_id) DO NOTHING;

-- Verify creation
SELECT r.id, r.name, r.business_user_id, r.address, r.is_open
FROM restaurants r
ORDER BY r.created_at DESC;
```

## After Running

1. **Refresh customer home page**
2. ✅ Shops from business users should appear!

## What Gets Created

For each business user, you'll get:
- **Name:** Business name (or user name if no business name)
- **Address:** Business address from signup
- **Phone:** User's phone number
- **Rating:** 5.0 (default)
- **is_open:** true (visible to customers)

## Files
- `CREATE_RESTAURANTS_FOR_BUSINESS_USERS.sql` - Full SQL script

## Summary
This script finds all business users in Supabase and creates restaurant entries for them, making their shops visible to customers!

