-- Fix: Enable Order Status Updates
-- Run this SQL in your Supabase SQL Editor to fix the RLS policies

-- Step 1: Disable RLS temporarily for testing (if it's causing issues)
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;

-- Step 2: Enable RLS again (recommended for production)
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Step 3: Create proper UPDATE policy for orders table
-- Allow all updates (permissive for testing, restrict in production)
CREATE POLICY "Allow updates to orders"
ON orders
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Step 4: Create SELECT policy if not exists
CREATE POLICY "Allow select orders"
ON orders
FOR SELECT
USING (true);

-- Step 5: Create INSERT policy if not exists
CREATE POLICY "Allow insert orders"
ON orders
FOR INSERT
WITH CHECK (true);

-- Step 6: Verify the status column exists and is VARCHAR
-- If this fails, your column might be named differently
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS status VARCHAR(50)
DEFAULT 'pending'
CHECK (status IN ('pending', 'preparing', 'ready', 'on-the-way', 'delivered', 'cancelled'));

-- Step 7: Check current RLS status
SELECT * FROM pg_tables
WHERE tablename = 'orders';

-- Step 8: Verify policies exist
SELECT schemaname, tablename, policyname
FROM pg_policies
WHERE tablename = 'orders';

