-- CRITICAL FIX: Add missing driver columns to ride_requests table

-- Step 1: CHECK CURRENT TABLE STRUCTURE
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'ride_requests'
ORDER BY ordinal_position;

-- Step 2: ADD MISSING DRIVER COLUMNS IF THEY DON'T EXIST
DO $$
BEGIN
  -- Add driver_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_id'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_id UUID;
    RAISE NOTICE 'Added driver_id column';
  END IF;

  -- Add driver_name column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_name'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_name VARCHAR(255);
    RAISE NOTICE 'Added driver_name column';
  END IF;

  -- Add driver_photo column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_photo'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_photo VARCHAR(500);
    RAISE NOTICE 'Added driver_photo column';
  END IF;

  -- Add driver_plate column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_plate'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_plate VARCHAR(50);
    RAISE NOTICE 'Added driver_plate column';
  END IF;

  -- Add driver_rating column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_rating'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_rating VARCHAR(10) DEFAULT '4.8';
    RAISE NOTICE 'Added driver_rating column';
  END IF;

  -- Add accepted_driver_id column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'accepted_driver_id'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN accepted_driver_id UUID;
    RAISE NOTICE 'Added accepted_driver_id column';
  END IF;

  -- Add driver_status column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_status'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_status VARCHAR(100);
    RAISE NOTICE 'Added driver_status column';
  END IF;

  -- Add driver_status_message column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_status_message'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_status_message TEXT;
    RAISE NOTICE 'Added driver_status_message column';
  END IF;

  -- Add driver_status_updated_at column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'driver_status_updated_at'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN driver_status_updated_at TIMESTAMP;
    RAISE NOTICE 'Added driver_status_updated_at column';
  END IF;

  -- Add accepted_at column if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ride_requests' AND column_name = 'accepted_at'
  ) THEN
    ALTER TABLE ride_requests ADD COLUMN accepted_at TIMESTAMP;
    RAISE NOTICE 'Added accepted_at column';
  END IF;

  RAISE NOTICE 'All missing columns have been added to ride_requests table!';
END $$;

-- Step 3: VERIFY ALL COLUMNS NOW EXIST
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'ride_requests'
ORDER BY ordinal_position;

-- Step 4: CREATE INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_id
ON ride_requests(driver_id);

CREATE INDEX IF NOT EXISTS idx_ride_requests_accepted_driver_id
ON ride_requests(accepted_driver_id);

CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_plate
ON ride_requests(driver_plate);

-- Step 5: TEST - Show sample ride data
SELECT
  id,
  driver_id,
  driver_name,
  driver_plate,
  driver_rating,
  accepted_driver_id,
  driver_status,
  status,
  created_at
FROM ride_requests
LIMIT 5;

-- Done! All columns are ready for the driver info card feature.

