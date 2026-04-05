-- CORRECTED RLS FIX - Works with any column structure
-- This simply ensures business users can only see orders for restaurants they own

-- Step 1: Drop old policies
DROP POLICY IF EXISTS "Business users can view orders for their restaurant only" ON orders;
DROP POLICY IF EXISTS "Business users can update orders for their restaurant only" ON orders;

-- Step 2: Create simple SELECT policy based on restaurant ownership
CREATE POLICY "Business users can view orders for their restaurant only" ON orders
  FOR SELECT
  USING (
    -- User can see order if they own the restaurant that the order belongs to
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::uuid
    )
  );

-- Step 3: Create simple UPDATE policy based on restaurant ownership
CREATE POLICY "Business users can update orders for their restaurant only" ON orders
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

-- Verification: Check orders table structure
SELECT COUNT(*) as total_orders,
       COUNT(restaurant_id) as with_restaurant_id
FROM orders;

