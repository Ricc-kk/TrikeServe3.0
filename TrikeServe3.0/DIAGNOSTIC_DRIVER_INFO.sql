-- DIAGNOSTIC: Verify Driver Info Card Setup

-- Step 1: CHECK IF COLUMNS EXIST
SELECT EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'ride_requests' AND column_name = 'driver_plate'
) AS driver_plate_exists,
EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'ride_requests' AND column_name = 'driver_rating'
) AS driver_rating_exists;

-- Step 2: CHECK TABLE STRUCTURE (what columns actually exist)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ride_requests'
ORDER BY ordinal_position;

-- Step 3: CHECK IF ANY RIDES HAVE DRIVER INFO
SELECT
  id,
  accepted_driver_id,
  driver_plate,
  driver_rating,
  status,
  created_at
FROM ride_requests
WHERE accepted_driver_id IS NOT NULL
ORDER BY created_at DESC
LIMIT 10;

-- Step 4: CHECK RIDE REQUESTS TABLE FOR ALL DATA
SELECT *
FROM ride_requests
LIMIT 1;

