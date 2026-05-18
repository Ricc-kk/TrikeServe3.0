-- Add missing driver status columns to ride_requests table
-- These columns track the driver's specific status during a ride

ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS driver_status VARCHAR(50);

ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS driver_status_message TEXT;

ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS driver_status_updated_at TIMESTAMP WITH TIME ZONE;

-- Add passengers_json column if it doesn't exist (for storing passenger data)
ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS passengers_json JSONB;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_status ON ride_requests(driver_status);

-- Print confirmation
SELECT 'Migration completed: Added driver_status, driver_status_message, driver_status_updated_at, and passengers_json columns to ride_requests table' as status;

