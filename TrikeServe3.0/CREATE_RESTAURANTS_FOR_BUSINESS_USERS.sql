-- Create restaurants for existing business users
-- Run this to create restaurants for all business users in the system

-- 1. First, let's check if there are any business users
SELECT id, email, name, business_name, business_address
FROM users
WHERE role = 'business'
ORDER BY created_at;

-- 2. Create restaurants for all business users that don't have one yet
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

-- 3. Verify the restaurants were created
SELECT r.id, r.name, r.business_user_id, r.address, r.is_open
FROM restaurants r
ORDER BY r.created_at DESC;

