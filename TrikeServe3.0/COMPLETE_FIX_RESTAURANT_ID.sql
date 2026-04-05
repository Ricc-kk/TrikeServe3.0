-- COMPLETE FIX: Add restaurant_id column and create proper RLS policies

-- ============================================================================
-- STEP 1: Add restaurant_id column if it doesn't exist
-- ============================================================================
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);

-- ============================================================================
-- STEP 2: Drop old problematic RLS policies
-- ============================================================================
DROP POLICY IF EXISTS "Business users can view orders for their restaurant only" ON orders;
DROP POLICY IF EXISTS "Business users can update orders for their restaurant only" ON orders;
DROP POLICY IF EXISTS "Customers can view their orders" ON orders;
DROP POLICY IF EXISTS "Customers can create orders" ON orders;
DROP POLICY IF EXISTS "Customers can update their own orders" ON orders;

-- ============================================================================
-- STEP 3: Enable RLS if not already enabled
-- ============================================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 4: Create SIMPLE and WORKING RLS policies
-- ============================================================================

-- Policy 1: Anyone can insert orders (customers creating orders)
CREATE POLICY "Anyone can create orders" ON orders
  FOR INSERT
  WITH CHECK (true);

-- Policy 2: Customers can view their own orders (by email)
CREATE POLICY "Customers can view their own orders by email" ON orders
  FOR SELECT
  USING (customer_email = current_user_email());

-- Policy 3: Business users can view orders for their restaurant
CREATE POLICY "Business users view their restaurant orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  );

-- Policy 4: Business users can update orders for their restaurant
CREATE POLICY "Business users update their restaurant orders" ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  );

-- ============================================================================
-- STEP 5: Verify setup
-- ============================================================================
-- Check RLS is enabled
SELECT tablename, rowsecurity FROM pg_tables WHERE tablename = 'orders';

-- Check policies exist
SELECT policyname FROM pg_policies WHERE tablename = 'orders' ORDER BY policyname;

-- Check column exists
SELECT column_name FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'restaurant_id';

