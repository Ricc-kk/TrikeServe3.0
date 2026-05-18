-- Add pickup and dropoff coordinate columns to ride_requests table
-- This allows the driver to see the customer's pickup location on the map
-- and enables the customer to see the ride destination

ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION;

-- Create indexes for faster location queries
CREATE INDEX IF NOT EXISTS idx_ride_requests_pickup_coords ON ride_requests(pickup_lat, pickup_lng);
CREATE INDEX IF NOT EXISTS idx_ride_requests_dropoff_coords ON ride_requests(dropoff_lat, dropoff_lng);

-- Create a comment explaining these columns
COMMENT ON COLUMN ride_requests.pickup_lat IS 'Latitude of the pickup location - used for map display in driver UI';
COMMENT ON COLUMN ride_requests.pickup_lng IS 'Longitude of the pickup location - used for map display in driver UI';
COMMENT ON COLUMN ride_requests.dropoff_lat IS 'Latitude of the dropoff location - used for map display in driver UI';
COMMENT ON COLUMN ride_requests.dropoff_lng IS 'Longitude of the dropoff location - used for map display in driver UI';

SELECT 'Migration completed: Added pickup and dropoff coordinate columns to ride_requests' as status;

