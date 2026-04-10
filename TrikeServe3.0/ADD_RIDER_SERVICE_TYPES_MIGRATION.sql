-- Migration: Add Rider Service Types, Online Status, and Current Seats
-- This migration adds columns to support rider service type selection and online status persistence
-- Execute this SQL in your Supabase project's SQL Editor

-- Add new columns to users table for rider service types and online status
ALTER TABLE users
ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS service_types TEXT[] DEFAULT ARRAY['shared', 'delivery'],
ADD COLUMN IF NOT EXISTS current_seats INTEGER DEFAULT 0;

-- Create an index on rider online status for quick lookups of available drivers
CREATE INDEX IF NOT EXISTS idx_users_is_online_role ON users(is_online, role)
WHERE role = 'rider';

-- Create an index on service types for filtering riders by service
CREATE INDEX IF NOT EXISTS idx_users_service_types ON users
USING GIN (service_types);

-- Add comment to document the new columns
COMMENT ON COLUMN users.is_online IS 'Whether the rider is currently online and accepting rides';
COMMENT ON COLUMN users.service_types IS 'Array of service types the rider accepts: shared, delivery, private';
COMMENT ON COLUMN users.current_seats IS 'Current number of seats occupied in the vehicle for shared rides';

-- Verify the changes by running this query:
-- SELECT id, name, is_online, service_types, current_seats FROM users WHERE role = 'rider';

