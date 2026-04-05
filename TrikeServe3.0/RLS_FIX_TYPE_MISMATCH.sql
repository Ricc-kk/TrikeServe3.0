-- DEFINITIVE FIX: Type Mismatch in RLS Policies
-- Problem: RLS uses auth.uid()::text but columns are UUID
-- Solution: Change all to auth.uid()::uuid

-- ============================================================================
-- DROP ALL OLD POLICIES (they don't work due to type mismatch)
-- ============================================================================
DROP POLICY IF EXISTS "Customers can view their own orders" ON orders;
DROP POLICY IF EXISTS "Business users can view orders for their restaurant only" ON orders;
DROP POLICY IF EXISTS "Customers can create orders" ON orders;
DROP POLICY IF EXISTS "Business users can update orders for their restaurant only" ON orders;
DROP POLICY IF EXISTS "Business users can view their restaurant orders" ON orders;
DROP POLICY IF EXISTS "Business users update their restaurant orders" ON orders;
DROP POLICY IF EXISTS "Anyone can create orders" ON orders;

-- ============================================================================
-- ADD MISSING COLUMN IF NOT EXISTS
-- ============================================================================
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);

-- ============================================================================
-- ENSURE RLS IS ENABLED
-- ============================================================================
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- CREATE NEW POLICIES WITH CORRECT TYPE CASTING (UUID)
-- ============================================================================

-- POLICY 1: Business users can ONLY view their own restaurant's orders
-- Uses UUID type casting (correct!)
CREATE POLICY "Business users view own restaurant orders" ON orders
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  );

-- POLICY 2: Business users can ONLY update their own restaurant's orders
CREATE POLICY "Business users update own restaurant orders" ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  );

-- POLICY 3: Allow anyone to insert orders
CREATE POLICY "Anyone can insert orders" ON orders
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- VERIFY SETUP
-- ============================================================================
SELECT 'RLS Policies Active:' as result;
SELECT policyname, qual FROM pg_policies
WHERE tablename = 'orders'
ORDER BY policyname;

SELECT 'RLS Status:' as result;
SELECT tablename, rowsecurity FROM pg_tables
WHERE tablename = 'orders';

SELECT 'Orders with restaurant_id:' as result;
SELECT
  COUNT(*) as total,
  COUNT(restaurant_id) as with_restaurant_id,
  COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as null_count
FROM orders;

