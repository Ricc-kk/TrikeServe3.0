-- FIX: Allow passengers to leave lobbies by updating RLS policies
-- Problem: Only the host (customer_id) could update the lobby, blocking other passengers from leaving
-- Solution: Allow any passenger in the lobby to update/leave
-- The current app uses leave_shared_ride_lobby(); also run CUSTOMER_LEAVE_RIDE_RLS_FIX.sql.

-- RLS policies do not grant SQL table privileges by themselves.
GRANT SELECT, INSERT, UPDATE ON public.shared_ride_lobbies TO authenticated;

-- Used by the join policy to ensure a customer adds their own passenger row.
CREATE OR REPLACE FUNCTION public.lobby_json_contains_passenger(passenger_list JSONB, user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT $2 IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof($1) = 'array' THEN $1 ELSE '[]'::jsonb END
    ) AS passenger(value)
    WHERE passenger.value->>'id' = $2::text
       OR passenger.value->>'id' ~ ('^' || $2::text || '_companion_[0-9]+$')
  );
$$;
REVOKE ALL ON FUNCTION public.lobby_json_contains_passenger(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lobby_json_contains_passenger(JSONB, UUID) TO authenticated;

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
    WHERE lobby.id = $1
      AND $2 IS NOT NULL
      AND $2 = auth.uid()
      AND public.lobby_json_contains_passenger(lobby.passengers_json, $2)
  );
$$;
REVOKE ALL ON FUNCTION public.is_lobby_passenger(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_lobby_passenger(UUID, UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.is_verified_lobby_rider(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT $1 IS NOT NULL
     AND $1 = auth.uid()
     AND EXISTS (
       SELECT 1 FROM public.users AS rider
       WHERE rider.id = $1
         AND rider.role = 'rider'
         AND rider.is_verified IS TRUE
     );
$$;
REVOKE ALL ON FUNCTION public.is_verified_lobby_rider(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_verified_lobby_rider(UUID) TO authenticated;

ALTER TABLE public.shared_ride_lobbies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view waiting lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can view waiting lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (status = 'waiting');
DROP POLICY IF EXISTS "Customers can view own lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can view own lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (auth.uid() = customer_id);

-- Let each passenger see only lobbies that contain their passenger row,
-- including after a driver has been assigned.
DROP POLICY IF EXISTS "Customers can view joined lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can view joined lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (
    auth.uid() IS NOT NULL
    AND public.is_lobby_passenger(id, auth.uid())
  );
DROP POLICY IF EXISTS "Drivers can view assigned lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Drivers can view assigned lobbies" ON public.shared_ride_lobbies
  FOR SELECT TO authenticated USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Customers can create lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Customers can create lobbies" ON public.shared_ride_lobbies
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = customer_id);

-- Drop old policy that restricted updates to only the host
DROP POLICY IF EXISTS "Customers can update own lobbies" ON public.shared_ride_lobbies;

-- Create new policy: Allow host OR any passenger to update the lobby
-- This allows passengers to remove themselves from the lobby
CREATE POLICY "Customers can update own lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated USING (
    auth.uid()::text = customer_id::text  -- Host can always update
    OR public.is_lobby_passenger(id, auth.uid())  -- Any passenger can update to remove themselves
  )
  -- The USING clause authorizes against the old passenger list. Once the
  -- customer is removed (or the host is promoted), they are no longer in the
  -- new row, so the new-row check only requires an authenticated caller.
  WITH CHECK (auth.uid() IS NOT NULL);

-- Also allow any authenticated user to update lobbies in 'waiting' status
-- (when no driver is assigned yet)
DROP POLICY IF EXISTS "Any user can update waiting lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Any user can update waiting lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated
  USING (status = 'waiting' AND driver_id IS NULL AND auth.uid() IS NOT NULL)
  WITH CHECK (
    status = 'waiting'
    AND driver_id IS NULL
    AND public.lobby_json_contains_passenger(passengers_json, auth.uid())
  );

DROP POLICY IF EXISTS "Drivers can update assigned lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Drivers can update assigned lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "Verified riders can accept waiting lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Verified riders can accept waiting lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated
  USING (
    status = 'waiting'
    AND driver_id IS NULL
    AND public.is_verified_lobby_rider(auth.uid())
  )
  WITH CHECK (
    status = 'driver_found'
    AND driver_id = auth.uid()
    AND public.is_verified_lobby_rider(auth.uid())
  );

COMMENT ON FUNCTION public.is_lobby_passenger(UUID, UUID) IS
'Helper function to check if a user ID is a passenger in a given lobby';

