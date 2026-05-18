-- Add driver-specific columns to ride_requests table
-- This migration adds missing columns used by the client code (driver location, driver info, ETA, and passengers JSON)

ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS accepted_driver_id UUID,
ADD COLUMN IF NOT EXISTS driver_id UUID,
ADD COLUMN IF NOT EXISTS driver_name TEXT,
ADD COLUMN IF NOT EXISTS driver_plate TEXT,
ADD COLUMN IF NOT EXISTS driver_rating TEXT,
ADD COLUMN IF NOT EXISTS driver_photo TEXT,
ADD COLUMN IF NOT EXISTS driver_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS driver_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS eta TEXT,
ADD COLUMN IF NOT EXISTS passengers_json JSONB;

-- Create useful indexes
CREATE INDEX IF NOT EXISTS idx_ride_requests_accepted_driver_id ON ride_requests(accepted_driver_id);
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_location ON ride_requests(driver_lat, driver_lng);
CREATE INDEX IF NOT EXISTS idx_ride_requests_passengers_json ON ride_requests USING gin (passengers_json);

SELECT 'Migration completed: Added driver and passengers columns to ride_requests' as status;

