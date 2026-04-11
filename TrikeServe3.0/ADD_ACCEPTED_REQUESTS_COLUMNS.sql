-- Add columns to ride_requests table for database-driven status tracking
-- This enables the customer to check the database directly for ride progress
-- Instead of relying on localStorage communication

-- Add accepted request tracking columns
ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS accepted_driver_id UUID,
ADD COLUMN IF NOT EXISTS driver_status VARCHAR(50) DEFAULT 'pending',
ADD COLUMN IF NOT EXISTS driver_status_message TEXT,
ADD COLUMN IF NOT EXISTS driver_status_updated_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS driver_photo TEXT;

-- Create index for faster lookups by ride ID
CREATE INDEX IF NOT EXISTS idx_ride_requests_id ON ride_requests(id);

-- Create index for faster lookups by customer ID and status
CREATE INDEX IF NOT EXISTS idx_ride_requests_customer_status ON ride_requests(customer_id, status);

-- Create index for driver status updates lookups
CREATE INDEX IF NOT EXISTS idx_ride_requests_driver_status_updated ON ride_requests(driver_status_updated_at DESC);

-- Add comment to ride_requests table
COMMENT ON COLUMN ride_requests.accepted_at IS 'Timestamp when driver accepted the request';
COMMENT ON COLUMN ride_requests.accepted_driver_id IS 'ID of the driver who accepted the request';
COMMENT ON COLUMN ride_requests.driver_status IS 'Current status of the ride (pending, on-the-way, arrived, in-progress, completed)';
COMMENT ON COLUMN ride_requests.driver_status_message IS 'User-friendly message about the current driver status';
COMMENT ON COLUMN ride_requests.driver_status_updated_at IS 'Timestamp when driver status was last updated';
COMMENT ON COLUMN ride_requests.driver_photo IS 'Profile photo URL of the driver';

