-- Add map coordinate columns used by the driver UI
-- Run this in Supabase SQL Editor.

-- Private ride requests
ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_ride_requests_pickup_coords ON ride_requests(pickup_lat, pickup_lng);
CREATE INDEX IF NOT EXISTS idx_ride_requests_dropoff_coords ON ride_requests(dropoff_lat, dropoff_lng);

COMMENT ON COLUMN ride_requests.pickup_lat IS 'Latitude of the pickup location shown in the driver UI';
COMMENT ON COLUMN ride_requests.pickup_lng IS 'Longitude of the pickup location shown in the driver UI';
COMMENT ON COLUMN ride_requests.dropoff_lat IS 'Latitude of the dropoff location shown in the driver UI';
COMMENT ON COLUMN ride_requests.dropoff_lng IS 'Longitude of the dropoff location shown in the driver UI';

-- Shared ride lobbies
ALTER TABLE shared_ride_lobbies
ADD COLUMN IF NOT EXISTS pickup_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS pickup_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_shared_ride_lobbies_pickup_coords ON shared_ride_lobbies(pickup_lat, pickup_lng);
CREATE INDEX IF NOT EXISTS idx_shared_ride_lobbies_dropoff_coords ON shared_ride_lobbies(dropoff_lat, dropoff_lng);

COMMENT ON COLUMN shared_ride_lobbies.pickup_lat IS 'Latitude of the shared ride pickup location shown in the driver UI';
COMMENT ON COLUMN shared_ride_lobbies.pickup_lng IS 'Longitude of the shared ride pickup location shown in the driver UI';
COMMENT ON COLUMN shared_ride_lobbies.dropoff_lat IS 'Latitude of the shared ride dropoff location shown in the driver UI';
COMMENT ON COLUMN shared_ride_lobbies.dropoff_lng IS 'Longitude of the shared ride dropoff location shown in the driver UI';

SELECT 'Migration completed: Added map coordinate columns for ride_requests and shared_ride_lobbies' AS status;

