-- DIRECT FIX: Populate restaurant_id for all NULL orders

-- This script will:
-- 1. Find all orders with NULL restaurant_id
-- 2. Match them to the correct restaurant
-- 3. Update the restaurant_id field

-- ============================================================================
-- Check orders table columns to understand the relationship
-- ============================================================================
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'orders'
ORDER BY ordinal_position;

-- ============================================================================
-- Show all orders and what they're currently linked to
-- ============================================================================
SELECT id, order_number, restaurant_id FROM orders LIMIT 20;

-- ============================================================================
-- MOST LIKELY FIX: If orders have a user_id or similar field that links to business user
-- We need to find the restaurant owned by that business user
-- ============================================================================

-- First, let's see ALL columns to understand the schema
SELECT * FROM orders LIMIT 1;

-- Then match to restaurants
SELECT * FROM restaurants LIMIT 1;

