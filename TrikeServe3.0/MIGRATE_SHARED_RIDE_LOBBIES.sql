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

-- Enable RLS before defining the customer and driver policies below.
ALTER TABLE shared_ride_lobbies ENABLE ROW LEVEL SECURITY;

-- Passengers need to read an assigned lobby in order to leave it after a
-- driver has accepted. SECURITY DEFINER avoids recursively evaluating the
-- lobby's RLS policies while checking passengers_json.
CREATE OR REPLACE FUNCTION public.is_lobby_passenger(lobby_id UUID, user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shared_ride_lobbies AS lobby
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN jsonb_typeof(lobby.passengers_json) = 'array' THEN lobby.passengers_json
        ELSE '[]'::jsonb
      END
    ) AS passenger(value)
    WHERE lobby.id = $1
      AND $2 IS NOT NULL
      AND $2 = auth.uid()
      AND (
        passenger.value->>'id' = $2::text
        OR passenger.value->>'id' LIKE $2::text || '_companion_%'
      )
  );
$$;
REVOKE ALL ON FUNCTION public.is_lobby_passenger(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lobby_passenger(UUID, UUID) TO authenticated, anon;

-- Update RLS policies for shared_ride_lobbies
-- Allow customers to view all waiting lobbies for browsing
DROP POLICY IF EXISTS "Customers can view waiting lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can view waiting lobbies" ON shared_ride_lobbies
  FOR SELECT USING (status = 'waiting');

-- Allow customers to view lobbies they created
DROP POLICY IF EXISTS "Customers can view own lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can view own lobbies" ON shared_ride_lobbies
  FOR SELECT USING (auth.uid()::text = customer_id::text);

-- Also allow a passenger to keep viewing their lobby after driver assignment.
DROP POLICY IF EXISTS "Customers can view joined lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can view joined lobbies" ON shared_ride_lobbies
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_lobby_passenger(id, auth.uid())
  );

-- Allow drivers to view lobbies assigned to them
DROP POLICY IF EXISTS "Drivers can view assigned lobbies" ON shared_ride_lobbies;
CREATE POLICY "Drivers can view assigned lobbies" ON shared_ride_lobbies
  FOR SELECT USING (auth.uid()::text = driver_id::text);

-- Allow customers to create lobbies
DROP POLICY IF EXISTS "Customers can create lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can create lobbies" ON shared_ride_lobbies
  FOR INSERT WITH CHECK (auth.uid()::text = customer_id::text);

-- Allow a lobby host or passenger to update the lobby so they can leave.
DROP POLICY IF EXISTS "Customers can update own lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can update own lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (
    auth.uid()::text = customer_id::text
    OR public.is_lobby_passenger(id, auth.uid())
  )
  -- Leaving removes the caller from passengers_json and may transfer host.
  WITH CHECK (auth.uid() IS NOT NULL);

-- Joining a waiting lobby is an update by a customer who is not its host.
DROP POLICY IF EXISTS "Any user can update waiting lobbies" ON shared_ride_lobbies;
CREATE POLICY "Any user can update waiting lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (status = 'waiting' AND auth.uid() IS NOT NULL);

-- Allow drivers to update lobbies they're assigned to
DROP POLICY IF EXISTS "Drivers can update assigned lobbies" ON shared_ride_lobbies;
CREATE POLICY "Drivers can update assigned lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (auth.uid()::text = driver_id::text);

-- Add comment explaining the passengers_json structure
COMMENT ON COLUMN shared_ride_lobbies.passengers_json IS
'JSON array of passenger objects: [{id, name, emoji, joinedAt, pickup, pickupAddress}, ...]';

COMMENT ON COLUMN shared_ride_lobbies.price_per_seat IS
'Price per seat for this lobby';

COMMENT ON COLUMN shared_ride_lobbies.max_seats IS
'Maximum number of seats available in this lobby';

COMMENT ON FUNCTION public.is_lobby_passenger(UUID, UUID) IS
'Helper function to check if a user ID is a passenger in a given lobby';

