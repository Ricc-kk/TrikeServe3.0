-- CRITICAL DIAGNOSTIC: Why RLS is Not Working

-- ============================================================================
-- 1. Check all RLS policies on orders table
-- ============================================================================
SELECT 'STEP 1: All RLS Policies on Orders Table' as diagnostic;
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;

-- ============================================================================
-- 2. Check if orders table has RLS enabled
-- ============================================================================
SELECT 'STEP 2: RLS Enabled Status' as diagnostic;
SELECT
  tablename,
  rowsecurity
FROM pg_tables
WHERE tablename = 'orders';

-- ============================================================================
-- 3. Check actual data - orders and their restaurants
-- ============================================================================
SELECT 'STEP 3: Orders and Restaurant Ownership' as diagnostic;
SELECT
  o.id,
  o.order_number,
  o.restaurant_id,
  r.id as restaurant_actual_id,
  r.name as restaurant_name,
  r.business_user_id,
  u.email as business_user_email
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_id = r.id
LEFT JOIN users u ON r.business_user_id = u.id
ORDER BY o.order_number;

-- ============================================================================
-- 4. Check for NULL restaurant_id
-- ============================================================================
SELECT 'STEP 4: NULL restaurant_id Check' as diagnostic;
SELECT
  COUNT(*) as total_orders,
  COUNT(restaurant_id) as with_restaurant_id,
  COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as null_count
FROM orders;

-- ============================================================================
-- 5. Check auth.uid() context (if possible)
-- ============================================================================
SELECT 'STEP 5: Current Auth User' as diagnostic;
SELECT auth.uid() as current_user_id;

-- ============================================================================
-- 6. Check restaurants table structure
-- ============================================================================
SELECT 'STEP 6: Restaurants Table Structure' as diagnostic;
SELECT
  id,
  name,
  business_user_id,
  (SELECT email FROM users WHERE id = restaurants.business_user_id) as owner_email
FROM restaurants;

-- ============================================================================
-- 7. Check if there are customer/admin policies allowing access
-- ============================================================================
SELECT 'STEP 7: All Policies on All Tables' as diagnostic;
SELECT
  schemaname,
  tablename,
  policyname,
  qual,
  with_check
FROM pg_policies
WHERE tablename IN ('orders', 'restaurants', 'users')
ORDER BY tablename, policyname;

-- ============================================================================
-- 8. Test RLS simulation - what would each user see?
-- ============================================================================
SELECT 'STEP 8: Simulated Access Control' as diagnostic;

-- Get all business users
WITH business_users AS (
  SELECT id, email, name FROM users WHERE role = 'business'
),
user_restaurants AS (
  SELECT bu.id as user_id, bu.email, r.id as restaurant_id, r.name as restaurant_name
  FROM business_users bu
  LEFT JOIN restaurants r ON r.business_user_id = bu.id
),
user_orders AS (
  SELECT ur.user_id, ur.email, ur.restaurant_id, o.order_number
  FROM user_restaurants ur
  LEFT JOIN orders o ON o.restaurant_id = ur.restaurant_id
)
SELECT user_id, email, COUNT(order_number) as visible_orders
FROM user_orders
WHERE order_number IS NOT NULL
GROUP BY user_id, email;

