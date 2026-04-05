-- CRITICAL FIX: RLS POLICY FOR ORDER ISOLATION (CORRECTED)
-- Issue: Orders from User A visible to User B
-- Root Cause: restaurant_id is NULL in orders table
-- Solution: Add fallback RLS policy using business_id, AND populate restaurant_id

-- Step 1: IMMEDIATE FIX - Add fallback RLS policy
DROP POLICY IF EXISTS "Business users can view orders for their restaurant only" ON orders;

CREATE POLICY "Business users can view orders for their restaurant only" ON orders
  FOR SELECT
  USING (
    CASE
      WHEN restaurant_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM restaurants
          WHERE restaurants.id = orders.restaurant_id
          AND restaurants.business_user_id = auth.uid()::uuid
        )
      ELSE
        orders.business_id = auth.uid()::uuid
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
          AND restaurants.business_user_id = auth.uid()::uuid
        )
      ELSE
        orders.business_id = auth.uid()::uuid
    END
  )
  WITH CHECK (
    CASE
      WHEN restaurant_id IS NOT NULL THEN
        EXISTS (
          SELECT 1 FROM restaurants
          WHERE restaurants.id = orders.restaurant_id
          AND restaurants.business_user_id = auth.uid()::uuid
        )
      ELSE
        orders.business_id = auth.uid()::uuid
    END
  );

-- Step 3: Populate restaurant_id for existing orders
UPDATE orders
SET restaurant_id = (
  SELECT restaurants.id
  FROM restaurants
  WHERE restaurants.business_user_id = orders.business_id
  LIMIT 1
)
WHERE restaurant_id IS NULL
AND business_id IS NOT NULL;

-- Verification: Check that restaurant_id is now populated
SELECT COUNT(*) as total_orders,
       COUNT(restaurant_id) as with_restaurant_id,
       COUNT(CASE WHEN restaurant_id IS NULL THEN 1 END) as still_null
FROM orders;

