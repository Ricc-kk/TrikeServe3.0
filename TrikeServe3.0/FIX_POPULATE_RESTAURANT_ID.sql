-- SOLUTION: Populate restaurant_id for all orders

-- ============================================================================
-- STEP 1: Check the actual structure of orders table
-- ============================================================================
SELECT 'STEP 1: Orders Table Structure' as step;
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- ============================================================================
-- STEP 2: Check current NULL status
-- ============================================================================
SELECT 'STEP 2: Current NULL Status' as step;
SELECT
  COUNT(*) as total_orders,
  COUNT(restaurant_id) as with_restaurant_id,
  COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as null_restaurant_id
FROM orders;

-- ============================================================================
-- STEP 3: Show orders with NULL restaurant_id (the problem orders)
-- ============================================================================
SELECT 'STEP 3: Orders with NULL restaurant_id' as step;
SELECT id, order_number FROM orders WHERE restaurant_id IS NULL LIMIT 10;

-- ============================================================================
-- STEP 4: Check restaurants - which business user owns which restaurant
-- ============================================================================
SELECT 'STEP 4: Restaurants and Their Owners' as step;
SELECT
  r.id as restaurant_id,
  r.name,
  r.business_user_id,
  u.email as owner_email
FROM restaurants r
LEFT JOIN users u ON r.business_user_id = u.id
ORDER BY r.name;

-- ============================================================================
-- STEP 5: SOLUTION - Link orders to restaurants
-- ============================================================================
-- METHOD 1: If there's a business_user_id column in orders
-- (Match orders to restaurants by finding the restaurant owned by that user)
/*
UPDATE orders
SET restaurant_id = (
  SELECT r.id
  FROM restaurants r
  WHERE r.business_user_id = orders.business_user_id
  LIMIT 1
)
WHERE restaurant_id IS NULL;
*/

-- METHOD 2: If orders have customer_id, find the restaurant that customer ordered from
-- (This requires knowing which restaurant the order was placed at)
-- You may need to do this manually if the relationship isn't stored

-- METHOD 3: If you know the order was from a specific restaurant, update by order_number
-- Example (adjust based on your actual data):
-- UPDATE orders SET restaurant_id = 'restaurant-uuid-here' WHERE order_number = 'ORD001';

-- ============================================================================
-- STEP 6: After populating, verify
-- ============================================================================
SELECT 'STEP 6: Verification After Update' as step;
SELECT
  COUNT(*) as total_orders,
  COUNT(restaurant_id) as with_restaurant_id,
  COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as still_null
FROM orders;

-- ============================================================================
-- STEP 7: Show updated orders with their restaurants
-- ============================================================================
SELECT 'STEP 7: Updated Orders Linked to Restaurants' as step;
SELECT
  o.order_number,
  o.restaurant_id,
  r.name as restaurant_name,
  u.email as owner_email
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_id = r.id
LEFT JOIN users u ON r.business_user_id = u.id
ORDER BY o.order_number;

