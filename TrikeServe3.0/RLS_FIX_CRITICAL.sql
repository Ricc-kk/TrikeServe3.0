-- CRITICAL FIX: RLS POLICY FOR ORDER ISOLATION
-- Issue: Orders from User A visible to User B
-- Root Cause: restaurant_id is NULL in orders table
-- Solution: Add fallback RLS policy using business_id, AND populate restaurant_id

-- Step 1: IMMEDIATE FIX - Add fallback RLS policy
-- This prevents data leakage while we populate restaurant_id

-- First, drop the current problematic policy
DROP POLICY IF EXISTS "Business users can view orders for their restaurant only" ON orders;

-- Replace with IMPROVED policy that has TWO conditions:
-- Condition 1: If restaurant_id is populated, check restaurant ownership
-- Condition 2: If restaurant_id is NULL, use business_id for backward compatibility
CREATE POLICY "Business users can view orders for their restaurant only" ON orders
  FOR SELECT
  USING (
    -- Condition 1: If restaurant_id is set, check restaurant ownership
    CASE
      WHEN restaurant_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM restaurants
          WHERE restaurants.id = orders.restaurant_id
          AND restaurants.business_user_id = auth.uid()::text
        )
      -- Condition 2: If restaurant_id is NULL, use business_id (backward compat)
      ELSE
        auth.uid()::text = business_id::text
    END
  );

-- Step 2: Fix UPDATE policy with same logic
DROP POLICY IF EXISTS "Business users can update orders for their restaurant only" ON orders;

CREATE POLICY "Business users can update orders for their restaurant only" ON orders
  FOR UPDATE
  USING (
    CASE
      WHEN restaurant_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM restaurants
          WHERE restaurants.id = orders.restaurant_id
          AND restaurants.business_user_id = auth.uid()::text
        )
      ELSE
        auth.uid()::text = business_id::text
    END
  )
  WITH CHECK (
    CASE
      WHEN restaurant_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM restaurants
          WHERE restaurants.id = orders.restaurant_id
          AND restaurants.business_user_id = auth.uid()::text
        )
      ELSE
        auth.uid()::text = business_id::text
    END
  );

-- Step 3: Populate restaurant_id for existing orders
-- This links orders to the restaurant they belong to
UPDATE orders
SET restaurant_id = (
  SELECT restaurants.id
  FROM restaurants
  WHERE restaurants.business_user_id = orders.business_id
  LIMIT 1
)
WHERE restaurant_id IS NULL
AND business_id IS NOT NULL;

-- Step 4: Verify the fix
-- Run these queries to check:
-- SELECT COUNT(*) as total_orders,
--        COUNT(restaurant_id) as with_restaurant_id,
--        COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as still_null
-- FROM orders;

-- Summary of the fix:
-- ✅ IMMEDIATE: RLS policy now handles NULL restaurant_id gracefully
-- ✅ FALLBACK: Uses business_id if restaurant_id is NULL
-- ✅ MIGRATION: Populated restaurant_id for existing orders
-- ✅ SECURITY: No data leakage - orders properly isolated
-- ✅ BACKWARD COMPATIBLE: Works with both old and new data

-- Next steps:
-- 1. Update Cart.tsx to include restaurant_id when creating orders
-- 2. Ensure all new orders have restaurant_id populated
-- 3. Monitor for any remaining NULL restaurant_id values
-- 4. Eventually, make restaurant_id NOT NULL once all orders are migrated

