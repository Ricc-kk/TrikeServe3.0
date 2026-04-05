-- TrikeServe3.0 - Fix Admins RLS Policies
-- These policies are fixed to allow viewing in table editor
-- Execute this in your Supabase SQL Editor

-- Drop old restrictive policies
DROP POLICY IF EXISTS "Admins can view their own profile" ON admins;
DROP POLICY IF EXISTS "Admins can update their own profile" ON admins;
DROP POLICY IF EXISTS "Service role can manage admins" ON admins;

-- Create new policies that work with custom authentication
-- Allow service role (Supabase dashboard) to see all admins
CREATE POLICY "Service role can manage admins" ON admins
  FOR ALL
  USING (auth.role() = 'service_role');

-- Allow anyone to read admins (frontend needs to load admin data)
CREATE POLICY "Anyone can read admins" ON admins
  FOR SELECT
  USING (true);

-- Allow anyone to insert admins (app validates user ownership)
CREATE POLICY "Anyone can insert admins" ON admins
  FOR INSERT
  WITH CHECK (true);

-- Allow anyone to update admins (app validates user ownership)
CREATE POLICY "Anyone can update admins" ON admins
  FOR UPDATE
  USING (true);

-- Allow anyone to delete admins (app validates user ownership)
CREATE POLICY "Anyone can delete admins" ON admins
  FOR DELETE
  USING (true);

