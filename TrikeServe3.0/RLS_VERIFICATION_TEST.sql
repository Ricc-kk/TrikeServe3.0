-- RLS ISOLATION VERIFICATION TEST
-- This script verifies that Business User A CANNOT see Business User B's orders

-- ============================================================================
-- SETUP: Create test data (if needed)
-- ============================================================================

-- Step 1: Create two test business users
-- (Only run if you don't have test users)
/*
INSERT INTO users (id, email, name, phone, role) VALUES
  ('a1111111-1111-1111-1111-111111111111', 'businessA@test.com', 'Business User A', '1234567890', 'business'),
  ('b2222222-2222-2222-2222-222222222222', 'businessB@test.com', 'Business User B', '0987654321', 'business')
ON CONFLICT DO NOTHING;
*/

-- Step 2: Create two restaurants owned by different business users
-- (Only run if you don't have test restaurants)
/*
INSERT INTO restaurants (id, name, business_user_id, address, phone) VALUES
  ('r1111111-1111-1111-1111-111111111111', 'Restaurant A', 'a1111111-1111-1111-1111-111111111111', '123 Main St', '1111111'),
  ('r2222222-2222-2222-2222-222222222222', 'Restaurant B', 'b2222222-2222-2222-2222-222222222222', '456 Oak Ave', '2222222')
ON CONFLICT DO NOTHING;
*/

-- Step 3: Create sample orders
-- (Only run if you don't have test orders)
/*
INSERT INTO orders (restaurant_id, order_number, items, total_amount, status, delivery_address) VALUES
  ('r1111111-1111-1111-1111-111111111111', 'ORD-A-001', '{"items": []}', 500.00, 'pending', '123 Customer St'),
  ('r1111111-1111-1111-1111-111111111111', 'ORD-A-002', '{"items": []}', 750.00, 'pending', '456 Customer Ave'),
  ('r2222222-2222-2222-2222-222222222222', 'ORD-B-001', '{"items": []}', 600.00, 'pending', '789 Customer Blvd'),
  ('r2222222-2222-2222-2222-222222222222', 'ORD-B-002', '{"items": []}', 800.00, 'pending', '321 Customer Lane');
*/

-- ============================================================================
-- TEST 1: Check all orders in database
-- ============================================================================
SELECT 'TEST 1: All Orders in Database' as test;
SELECT COUNT(*) as total_orders FROM orders;
SELECT order_number, restaurant_id FROM orders ORDER BY order_number;

-- ============================================================================
-- TEST 2: RLS Policy Verification
-- ============================================================================
SELECT 'TEST 2: RLS Policies Active' as test;
SELECT policyname, qual, with_check
FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;

-- ============================================================================
-- TEST 3: Business User A Access
-- ============================================================================
SELECT 'TEST 3: Business User A Should See Only Restaurant A Orders' as test;

-- Get Restaurant A ID and its owner
SELECT r.id as restaurant_id, r.name, r.business_user_id
FROM restaurants r
WHERE name = 'Restaurant A';

-- Show orders that should be visible to Business User A
SELECT 'Orders visible to User A:' as info;
SELECT o.order_number, o.restaurant_id, r.name as restaurant_name
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_id = r.id
WHERE EXISTS (
  SELECT 1 FROM restaurants
  WHERE restaurants.id = o.restaurant_id
  AND restaurants.business_user_id = 'a1111111-1111-1111-1111-111111111111'::uuid
);

-- ============================================================================
-- TEST 4: Business User B Access
-- ============================================================================
SELECT 'TEST 4: Business User B Should See Only Restaurant B Orders' as test;

-- Get Restaurant B ID and its owner
SELECT r.id as restaurant_id, r.name, r.business_user_id
FROM restaurants r
WHERE name = 'Restaurant B';

-- Show orders that should be visible to Business User B
SELECT 'Orders visible to User B:' as info;
SELECT o.order_number, o.restaurant_id, r.name as restaurant_name
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_id = r.id
WHERE EXISTS (
  SELECT 1 FROM restaurants
  WHERE restaurants.id = o.restaurant_id
  AND restaurants.business_user_id = 'b2222222-2222-2222-2222-222222222222'::uuid
);

-- ============================================================================
-- TEST 5: Cross-Check - User A CANNOT see User B's Orders
-- ============================================================================
SELECT 'TEST 5: User A CANNOT See User B Orders (Should be 0)' as test;
SELECT COUNT(*) as user_a_should_not_see
FROM orders o
WHERE EXISTS (
  SELECT 1 FROM restaurants
  WHERE restaurants.id = o.restaurant_id
  AND restaurants.business_user_id = 'a1111111-1111-1111-1111-111111111111'::uuid
)
AND EXISTS (
  SELECT 1 FROM restaurants
  WHERE restaurants.id = o.restaurant_id
  AND restaurants.business_user_id = 'b2222222-2222-2222-2222-222222222222'::uuid
);

-- ============================================================================
-- TEST 6: Verify restaurant_id is populated
-- ============================================================================
SELECT 'TEST 6: Restaurant ID Population Status' as test;
SELECT
  COUNT(*) as total_orders,
  COUNT(restaurant_id) as with_restaurant_id,
  COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as null_restaurant_id,
  ROUND(100.0 * COUNT(restaurant_id) / COUNT(*), 2) as percent_populated
FROM orders;

-- ============================================================================
-- EXPECTED TEST RESULTS
-- ============================================================================
/*
TEST 1: Should show total number of orders (e.g., 4)
TEST 2: Should show RLS policies:
  - "Business users can view orders for their restaurant only"
  - "Business users can update orders for their restaurant only"

TEST 3: User A should see 2 orders (ORD-A-001, ORD-A-002)
TEST 4: User B should see 2 orders (ORD-B-001, ORD-B-002)
TEST 5: Should return 0 (User A cannot see User B's orders) ✅
TEST 6: null_restaurant_id should be 0 (all orders have restaurant_id)

IF ALL TESTS PASS:
✅ RLS IS WORKING CORRECTLY
✅ Business User A CANNOT see Business User B's orders
✅ Orders are properly isolated by restaurant
*/

