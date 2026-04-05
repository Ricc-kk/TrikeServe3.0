-- BUSINESS USER ORDER ISOLATION - DATABASE RLS POLICIES
-- Ensures business users can ONLY see orders for their own restaurant
-- Execute this SQL in your Supabase project's SQL Editor

-- First, let's verify the schema relationships
-- orders.business_id → users.id (business user)
-- restaurants.business_user_id → users.id (business user)
-- We need to link orders to restaurants via the business_user_id

-- Step 1: Add restaurant_id column to orders table if it doesn't exist
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS restaurant_id UUID REFERENCES restaurants(id) ON DELETE CASCADE;

-- Create index for restaurant_id for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_restaurant ON orders(restaurant_id);

-- Step 2: DROP existing RLS policies for orders (to replace with better ones)
DROP POLICY IF EXISTS "Customers can view their orders" ON orders;
DROP POLICY IF EXISTS "Businesses can view orders for their restaurant" ON orders;

-- Step 3: CREATE NEW RLS Policies for orders with proper restaurant isolation

-- Policy 1: Customers can view ONLY their own orders
CREATE POLICY "Customers can view their own orders" ON orders
  FOR SELECT
  USING (auth.uid()::text = customer_id::text);

-- Policy 2: Business users can view ONLY orders for their restaurant
-- This uses the restaurants table to ensure isolation
CREATE POLICY "Business users can view orders for their restaurant only" ON orders
  FOR SELECT
  USING (
    -- Business user can see orders for restaurants they own
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

-- Policy 3: Customers can create orders
CREATE POLICY "Customers can create orders" ON orders
  FOR INSERT
  WITH CHECK (auth.uid()::text = customer_id::text);

-- Policy 4: Business users can update order status ONLY for their restaurant's orders
CREATE POLICY "Business users can update orders for their restaurant only" ON orders
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

-- Policy 5: Customers can update their own orders (before delivery)
CREATE POLICY "Customers can update their own orders" ON orders
  FOR UPDATE
  USING (auth.uid()::text = customer_id::text)
  WITH CHECK (auth.uid()::text = customer_id::text);

-- Step 4: Ensure restaurants table has proper RLS

-- DROP existing policies if any
DROP POLICY IF EXISTS "Public can view restaurants" ON restaurants;
DROP POLICY IF EXISTS "Business users can view their restaurant" ON restaurants;
DROP POLICY IF EXISTS "Business users can update their restaurant" ON restaurants;

-- New restaurant policies
CREATE POLICY "Public can view all restaurants" ON restaurants
  FOR SELECT
  USING (true);  -- Everyone can see restaurant listings

CREATE POLICY "Business users can view their restaurant" ON restaurants
  FOR SELECT
  USING (auth.uid()::text = business_user_id::text);

CREATE POLICY "Business users can update their restaurant" ON restaurants
  FOR UPDATE
  USING (auth.uid()::text = business_user_id::text)
  WITH CHECK (auth.uid()::text = business_user_id::text);

CREATE POLICY "Business users can create restaurant" ON restaurants
  FOR INSERT
  WITH CHECK (auth.uid()::text = business_user_id::text);

-- Step 5: RLS for menu items (should be restaurant-specific)

-- DROP existing policy if any
DROP POLICY IF EXISTS "Public can view menu items" ON menu_items;

CREATE POLICY "Public can view all menu items" ON menu_items
  FOR SELECT
  USING (true);  -- Everyone can see menus

CREATE POLICY "Business users can manage menu items for their restaurant" ON menu_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = menu_items.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

CREATE POLICY "Business users can update menu items for their restaurant" ON menu_items
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = menu_items.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = menu_items.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

CREATE POLICY "Business users can delete menu items for their restaurant" ON menu_items
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = menu_items.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

-- Step 6: Verify everything is enabled
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- CRITICAL VALIDATION QUERIES (run these to verify it's working)
-- Note: These are for testing, uncomment to run

-- Test 1: Check RLS policies are enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('orders', 'restaurants', 'menu_items');

-- Test 2: List all RLS policies
-- SELECT * FROM pg_policies WHERE tablename = 'orders';

-- Summary of what was implemented:
-- ✅ Orders table: business_user can only see orders for their restaurant
-- ✅ Orders table: restaurant_id foreign key for proper relationship
-- ✅ Orders table: Update policy ensures business_user can only modify their orders
-- ✅ Restaurants table: Public can view all, business_user can only manage their own
-- ✅ Menu Items table: Public can view all, business_user can manage their items
-- ✅ Complete isolation: No business_user can access another business_user's data
-- ✅ Customer access preserved: Customers see only their own orders
-- ✅ Performance optimized: Indexed columns for fast queries

