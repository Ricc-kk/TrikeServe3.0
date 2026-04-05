-- BUSINESS USER ISOLATION FIX - VERIFICATION AND SETUP SCRIPT
-- Execute this in Supabase SQL Editor to verify RLS is properly configured

-- ============================================================================
-- STEP 1: Verify RLS is Enabled on Orders Table
-- ============================================================================
SELECT
  schemaname,
  tablename,
  rowsecurity as "RLS Enabled"
FROM pg_tables
WHERE tablename = 'orders' AND schemaname = 'public';

-- Expected Result:
-- ✅ rowsecurity = true

-- ============================================================================
-- STEP 2: List All RLS Policies on Orders Table
-- ============================================================================
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  qual as "Policy Condition",
  with_check
FROM pg_policies
WHERE tablename = 'orders' AND schemaname = 'public'
ORDER BY policyname;

-- Expected Results:
-- ✅ "Business users can update orders for their restaurant only"
-- ✅ "Business users can view orders for their restaurant only"
-- ✅ "Customers can create orders"
-- ✅ "Customers can update their own orders"
-- ✅ "Customers can view their own orders"

-- ============================================================================
-- STEP 3: Verify Restaurants Table Structure
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'restaurants' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Expected Columns:
-- ✅ id (UUID)
-- ✅ business_user_id (UUID, NOT NULL, UNIQUE)
-- ✅ name (VARCHAR)
-- ✅ address (VARCHAR)
-- ✅ phone (VARCHAR)
-- ✅ rating (DECIMAL)
-- ✅ is_open (BOOLEAN)
-- ✅ created_at (TIMESTAMP)
-- ✅ updated_at (TIMESTAMP)

-- ============================================================================
-- STEP 4: Verify Orders Table Has restaurant_id Column
-- ============================================================================
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'orders' AND table_schema = 'public'
ORDER BY ordinal_position;

-- Expected:
-- ✅ restaurant_id (UUID) - Foreign key to restaurants.id

-- ============================================================================
-- STEP 5: Check for Foreign Key Constraint
-- ============================================================================
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name as foreign_table_name,
  ccu.column_name as foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'orders'
  AND ccu.table_name = 'restaurants';

-- Expected:
-- ✅ Foreign key from orders.restaurant_id → restaurants.id

-- ============================================================================
-- STEP 6: Verify Index on restaurant_id
-- ============================================================================
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'orders' AND schemaname = 'public'
ORDER BY indexname;

-- Expected:
-- ✅ idx_orders_restaurant (on restaurant_id)

-- ============================================================================
-- STEP 7: Test RLS Policy - Verify it Exists and is Correct
-- ============================================================================
-- This shows the actual policy definition
SELECT
  policyname,
  qual as "SELECT Policy",
  with_check as "INSERT/UPDATE Policy"
FROM pg_policies
WHERE tablename = 'orders'
  AND policyname = 'Business users can view orders for their restaurant only'
  AND schemaname = 'public';

-- Expected: Policy checks that restaurants.business_user_id = auth.uid()

-- ============================================================================
-- STEP 8: Check for Sample Data Integrity
-- ============================================================================
-- Verify all orders have restaurant_id populated
SELECT
  COUNT(*) as total_orders,
  COUNT(restaurant_id) as orders_with_restaurant_id,
  COUNT(*) - COUNT(restaurant_id) as orders_without_restaurant_id
FROM orders;

-- Expected:
-- ✅ orders_without_restaurant_id = 0 (all orders have restaurant_id)

-- ============================================================================
-- STEP 9: Verify Business Users Have Restaurants
-- ============================================================================
SELECT
  u.id as user_id,
  u.email,
  u.role,
  r.id as restaurant_id,
  r.name as restaurant_name
FROM users u
LEFT JOIN restaurants r ON u.id = r.business_user_id
WHERE u.role = 'business'
ORDER BY u.email;

-- Expected:
-- ✅ Each business user (role = 'business') has exactly one restaurant
-- ✅ Each restaurant has exactly one business_user_id

-- ============================================================================
-- STEP 10: Simulate RLS Check - Can Business User A see Restaurant B's orders?
-- ============================================================================
-- This test uses Supabase Auth Context
-- You need to run this from the app or use Supabase's "Test" feature

-- Pseudo-SQL (requires auth context):
--
-- AS User A (id = uuid-aaa, owns restaurant-aaa):
-- SELECT * FROM orders WHERE restaurant_id = 'restaurant-bbb'
--
-- Expected:
-- ✅ If restaurant-bbb.business_user_id ≠ uuid-aaa
-- ✅ RLS blocks query or returns 0 rows
-- ✅ User A cannot access restaurant-bbb's orders

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================

-- Problem: RLS Disabled on Orders Table
-- Solution:
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Problem: Missing Business User Policy
-- Solution:
CREATE POLICY "Business users can view orders for their restaurant only" ON orders
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = orders.restaurant_id
      AND restaurants.business_user_id = auth.uid()::text
    )
  );

-- Problem: Missing Update Policy
-- Solution:
CREATE POLICY "Business users can update orders for their restaurant only" ON orders
  FOR UPDATE USING (
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

-- ============================================================================
-- CLEANUP: Remove any insecure policies (if they exist)
-- ============================================================================

-- ❌ OLD INSECURE POLICY (should be removed):
DROP POLICY IF EXISTS "Businesses can view orders for their restaurant" ON orders;

-- ❌ If there's a policy based on business_id instead of restaurant_id:
DROP POLICY IF EXISTS "Business users can view orders by business_id" ON orders;

-- ============================================================================
-- FINAL VERIFICATION
-- ============================================================================

-- Run this query to confirm everything is set up:
SELECT
  COUNT(DISTINCT policyname) as total_policies,
  array_agg(DISTINCT policyname) as policy_names,
  (
    SELECT rowsecurity FROM pg_tables
    WHERE tablename = 'orders'
  ) as rls_enabled
FROM pg_policies
WHERE tablename = 'orders' AND schemaname = 'public';

-- Expected Output:
-- ✅ total_policies >= 5
-- ✅ rls_enabled = true
-- ✅ Policies include "Business users can view orders for their restaurant only"

-- ============================================================================
-- CERTIFICATE OF COMPLETION
-- ============================================================================
-- Run this final check - if all return results, RLS is properly configured:

-- 1. RLS Enabled
SELECT COUNT(*) FROM pg_tables WHERE tablename = 'orders' AND rowsecurity = true;
-- Expected: 1

-- 2. Correct Policies Present
SELECT COUNT(*) FROM pg_policies WHERE tablename = 'orders' AND policyname LIKE 'Business users%';
-- Expected: 2 (view + update)

-- 3. Restaurant-Order Foreign Key Exists
SELECT COUNT(*) FROM information_schema.constraint_column_usage
WHERE table_name = 'orders' AND column_name = 'restaurant_id';
-- Expected: 1

-- ✅ If all three checks return the expected results, the fix is complete!

