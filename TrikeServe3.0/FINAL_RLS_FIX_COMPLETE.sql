-- COMPLETE DIAGNOSTIC AND FIX
-- Run this to see what's wrong and fix it completely

-- ============================================================================
-- DIAGNOSTIC: Check current state
-- ============================================================================

-- 1. Check if restaurant_id column exists
SELECT 'DIAGNOSTIC 1: restaurant_id column' as test;
SELECT column_name FROM information_schema.columns
WHERE table_name = 'orders' AND column_name = 'restaurant_id';

-- 2. Check how many orders have restaurant_id populated
SELECT 'DIAGNOSTIC 2: restaurant_id population' as test;
SELECT
  COUNT(*) as total_orders,
  COUNT(restaurant_id) as with_restaurant_id,
  COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as null_count
FROM orders;

-- 3. Check RLS policies
SELECT 'DIAGNOSTIC 3: RLS Policies' as test;
SELECT policyname, qual FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;

-- 4. Check if RLS is enabled
SELECT 'DIAGNOSTIC 4: RLS Enabled Status' as test;
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename = 'orders';

-- 5. Show orders with restaurant info
SELECT 'DIAGNOSTIC 5: Orders with Restaurant Info' as test;
SELECT
  o.order_number,
  o.restaurant_id,
  r.name as restaurant_name,
  r.business_user_id,
  u.email as owner_email
FROM orders o
LEFT JOIN restaurants r ON o.restaurant_id = r.id
LEFT JOIN users u ON r.business_user_id = u.id
LIMIT 10;

-- ============================================================================
-- ACTUAL FIX: Execute all steps
-- ============================================================================

-- Step 1: Add restaurant_id column if missing
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;

-- Step 2: Create index
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);

-- Step 3: Enable RLS on orders table
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop ALL old policies
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;
DROP POLICY IF EXISTS "Business users can view orders for their restaurant only" ON orders;
DROP POLICY IF EXISTS "Business users can update orders for their restaurant only" ON orders;
DROP POLICY IF EXISTS "Business users view their restaurant orders" ON orders;
DROP POLICY IF EXISTS "Business users update their restaurant orders" ON orders;
DROP POLICY IF EXISTS "Customers can view their orders" ON orders;
DROP POLICY IF EXISTS "Customers can create orders" ON orders;
DROP POLICY IF EXISTS "Customers can update their own orders" ON orders;
DROP POLICY IF EXISTS "Enable read access for all users" ON orders;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON orders;
DROP POLICY IF EXISTS "allow select" ON orders;

-- Step 5: Create STRICT RLS policies - NO PUBLIC ACCESS

-- POLICY 1: ONLY business users of a restaurant can view orders for that restaurant
CREATE POLICY "business_users_can_view_own_restaurant_orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  );

-- POLICY 2: ONLY business users of a restaurant can update orders for that restaurant
CREATE POLICY "business_users_can_update_own_restaurant_orders" ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  );

-- POLICY 3: ONLY allow INSERT (anyone can create orders initially)
CREATE POLICY "allow_insert_orders" ON orders
  FOR INSERT
  WITH CHECK (true);

-- Step 6: Verify the fix
SELECT 'VERIFICATION: RLS Policies Created' as test;
SELECT policyname FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;

SELECT 'VERIFICATION: RLS Enabled' as test;
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename = 'orders';

