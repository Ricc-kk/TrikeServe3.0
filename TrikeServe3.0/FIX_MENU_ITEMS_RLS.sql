-- TrikeServe3.0 - Fix Menu Items RLS Policies
-- These policies are fixed to work with custom authentication
-- Execute this in your Supabase SQL Editor

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Service role can manage menu items" ON menu_items;
DROP POLICY IF EXISTS "Businesses can view and manage their menu items" ON menu_items;
DROP POLICY IF EXISTS "Customers can view menu items" ON menu_items;

-- Create new policies that work with custom auth
-- Allow anyone to insert menu items (restaurant_id validation happens at app level)
CREATE POLICY "Anyone can insert menu items" ON menu_items
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to read menu items
CREATE POLICY "Anyone can read menu items" ON menu_items
  FOR SELECT
  USING (true);

-- Allow anyone to update menu items (restaurant_id validation happens at app level)
CREATE POLICY "Anyone can update menu items" ON menu_items
  FOR UPDATE
  USING (true);

-- Allow anyone to delete menu items (restaurant_id validation happens at app level)
CREATE POLICY "Anyone can delete menu items" ON menu_items
  FOR DELETE
  USING (true);

