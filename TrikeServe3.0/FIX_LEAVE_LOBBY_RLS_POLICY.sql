-- FIX: Allow passengers to leave lobbies by updating RLS policies
-- Problem: Only the host (customer_id) could update the lobby, blocking other passengers from leaving
-- Solution: Allow any passenger in the lobby to update/leave

-- A passenger must be able to re-read an assigned lobby after it stops being
-- waiting; otherwise leaveShareRideLobby cannot fetch the row to update it.
-- SECURITY DEFINER avoids recursive evaluation of the lobby's RLS policies.
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

-- Let each passenger see only lobbies that contain their passenger row,
-- including after a driver has been assigned.
DROP POLICY IF EXISTS "Customers can view joined lobbies" ON shared_ride_lobbies;
CREATE POLICY "Customers can view joined lobbies" ON shared_ride_lobbies
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND public.is_lobby_passenger(id, auth.uid())
  );

-- Drop old policy that restricted updates to only the host
DROP POLICY IF EXISTS "Customers can update own lobbies" ON shared_ride_lobbies;

-- Create new policy: Allow host OR any passenger to update the lobby
-- This allows passengers to remove themselves from the lobby
CREATE POLICY "Customers can update own lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (
    auth.uid()::text = customer_id::text  -- Host can always update
    OR public.is_lobby_passenger(id, auth.uid())  -- Any passenger can update to remove themselves
  )
  -- The USING clause authorizes against the old passenger list. Once the
  -- customer is removed (or the host is promoted), they are no longer in the
  -- new row, so the new-row check only requires an authenticated caller.
  WITH CHECK (auth.uid() IS NOT NULL);

-- Also allow any authenticated user to update lobbies in 'waiting' status
-- (when no driver is assigned yet)
DROP POLICY IF EXISTS "Any user can update waiting lobbies" ON shared_ride_lobbies;
CREATE POLICY "Any user can update waiting lobbies" ON shared_ride_lobbies
  FOR UPDATE USING (status = 'waiting' AND auth.uid()::text IS NOT NULL);

COMMENT ON FUNCTION public.is_lobby_passenger(UUID, UUID) IS
'Helper function to check if a user ID is a passenger in a given lobby';

