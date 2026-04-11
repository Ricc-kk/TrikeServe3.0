-- Ensure driver_plate and driver_rating columns exist in ride_requests table
-- Run this in Supabase SQL Editor if columns don't exist

-- Step 1: Check if columns exist and add them if missing
DO $$
BEGIN
  -- Add driver_plate column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_plate'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_plate VARCHAR(50);
    COMMENT ON COLUMN ride_requests.driver_plate IS 'Driver vehicle plate number (TODA plate)';
  END IF;

  -- Add driver_rating column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_rating'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_rating VARCHAR(10) DEFAULT '4.8';
    COMMENT ON COLUMN ride_requests.driver_rating IS 'Driver rating (e.g., 4.8 stars)';
  END IF;

END $$;

-- Step 2: Verify columns exist
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'ride_requests'
  AND column_name IN ('driver_plate', 'driver_rating')
ORDER BY ordinal_position;

-- Step 3: Create index for faster queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_plate
ON ride_requests(driver_plate);

CREATE INDEX IF NOT EXISTS idx_ride_requests_accepted_driver_id
ON ride_requests(accepted_driver_id);

-- Step 4: Enable real-time subscriptions (if not already enabled)
-- This should already be enabled in Supabase, but verify:
ALTER TABLE ride_requests REPLICA IDENTITY FULL;

-- Step 5: Test the columns by selecting sample data
SELECT
  id,
  driver_plate,
  driver_rating,
  status,
  created_at
FROM ride_requests
LIMIT 5;

-- Done! The columns are now ready for the real-time driver info card feature.
-- Columns driver_plate and driver_rating have been successfully added to the table.

