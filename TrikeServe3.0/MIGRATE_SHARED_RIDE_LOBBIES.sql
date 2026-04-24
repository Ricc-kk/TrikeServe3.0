-- Migration: Enhance Shared Ride Lobbies Table
-- This migration adds additional columns needed for proper share ride lobby management

-- Add missing columns to shared_ride_lobbies table
ALTER TABLE shared_ride_lobbies
ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES users(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS pickup_address VARCHAR(500),
ADD COLUMN IF NOT EXISTS dropoff_address VARCHAR(500),
ADD COLUMN IF NOT EXISTS max_seats INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS price_per_seat DECIMAL(10, 2) DEFAULT 15,
ADD COLUMN IF NOT EXISTS passengers_json JSONB DEFAULT '[]',
ADD COLUMN IF NOT EXISTS driver_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS driver_plate VARCHAR(50),
ADD COLUMN IF NOT EXISTS driver_rating VARCHAR(10);

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_lobbies_customer ON shared_ride_lobbies(customer_id);
CREATE INDEX IF NOT EXISTS idx_lobbies_status_waiting ON shared_ride_lobbies(status)
  WHERE status = 'waiting';
CREATE INDEX IF NOT EXISTS idx_lobbies_pickup_dropoff_status ON shared_ride_lobbies(pickup_address, dropoff_address, status);
CREATE INDEX IF NOT EXISTS idx_lobbies_dropoff_status ON shared_ride_lobbies(dropoff_location, status);
CREATE INDEX IF NOT EXISTS idx_lobbies_created_at ON shared_ride_lobbies(created_at);

-- Update RLS policies for shared_ride_lobbies
-- Allow customers to view all waiting lobbies for browsing
DROP POLICY IF EXISTS "Customers can view waiting lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can view waiting lobbies" ON shared_ride_lobbies
  FOR SELECT USING (status = 'waiting');

-- Allow customers to view lobbies they created
DROP POLICY IF EXISTS "Customers can view own lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can view own lobbies" ON shared_ride_lobbies
  FOR SELECT USING (auth.uid()::text = customer_id::text);

-- Allow drivers to view lobbies assigned to them
DROP POLICY IF EXISTS "Drivers can view assigned lobbies" ON shared_ride_lobbies;
CREATE POLICY "Drivers can view assigned lobbies" ON shared_ride_lobbies
  FOR SELECT USING (auth.uid()::text = driver_id::text);

-- Allow customers to create lobbies
DROP POLICY IF EXISTS "Customers can create lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can create lobbies" ON shared_ride_lobbies
  FOR INSERT WITH CHECK (auth.uid()::text = customer_id::text);

-- Allow customers to update their own lobbies
DROP POLICY IF EXISTS "Customers can update own lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can update own lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (auth.uid()::text = customer_id::text);

-- Allow drivers to update lobbies they're assigned to
DROP POLICY IF EXISTS "Drivers can update assigned lobbies" ON shared_ride_lobbies;
CREATE POLICY "Drivers can update assigned lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (auth.uid()::text = driver_id::text);

-- Enable RLS on shared_ride_lobbies if not already enabled
ALTER TABLE shared_ride_lobbies ENABLE ROW LEVEL SECURITY;

-- Add comment explaining the passengers_json structure
COMMENT ON COLUMN shared_ride_lobbies.passengers_json IS
'JSON array of passenger objects: [{id, name, emoji, joinedAt, pickup, pickupAddress}, ...]';

COMMENT ON COLUMN shared_ride_lobbies.price_per_seat IS
'Price per seat for this lobby';

COMMENT ON COLUMN shared_ride_lobbies.max_seats IS
'Maximum number of seats available in this lobby';

