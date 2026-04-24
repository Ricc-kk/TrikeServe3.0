-- FIX: Allow passengers to leave lobbies by updating RLS policies
-- Problem: Only the host (customer_id) could update the lobby, blocking other passengers from leaving
-- Solution: Allow any passenger in the lobby to update/leave

-- First, create a helper function to check if user is a passenger in the lobby
CREATE OR REPLACE FUNCTION is_lobby_passenger(lobby_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  passengers JSONB;
BEGIN
  SELECT passengers_json INTO passengers
  FROM shared_ride_lobbies
  WHERE id = lobby_id;

  -- Check if user is in passengers array
  RETURN EXISTS (
    SELECT 1
    FROM jsonb_array_elements(COALESCE(passengers, '[]'::jsonb)) AS p
    WHERE p->>'id' = user_id::text
       OR p->>'id' LIKE user_id::text || '_companion_%'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop old policy that restricted updates to only the host
DROP POLICY IF EXISTS "Customers can update own lobbies" ON shared_ride_lobbies;

-- Create new policy: Allow host OR any passenger to update the lobby
-- This allows passengers to remove themselves from the lobby
CREATE POLICY "Customers can update own lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (
    auth.uid()::text = customer_id::text  -- Host can always update
    OR is_lobby_passenger(id, auth.uid())  -- Any passenger can update to remove themselves
  );

-- Also allow any authenticated user to update lobbies in 'waiting' status
-- (when no driver is assigned yet)
DROP POLICY IF EXISTS "Any user can update waiting lobbies" ON shared_ride_lobbies;
CREATE POLICY "Any user can update waiting lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (status = 'waiting' AND auth.uid()::text IS NOT NULL);

COMMENT ON FUNCTION is_lobby_passenger(UUID, UUID) IS
'Helper function to check if a user ID is a passenger in a given lobby';

