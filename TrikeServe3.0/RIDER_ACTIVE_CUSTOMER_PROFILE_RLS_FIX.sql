-- Let a driver read the profile of passengers on that driver's active ride only.
-- This is needed by the Active Ride customer card; it does not grant general
-- access to customer profiles.

-- Keep this fix self-contained: the active ride profile check also needs to
-- recognize passengers stored in the lobby's JSON passenger list.
CREATE OR REPLACE FUNCTION public.lobby_json_contains_passenger(passenger_list JSONB, user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $function$
  SELECT $2 IS NOT NULL AND EXISTS (
    SELECT 1
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof($1) = 'array' THEN $1 ELSE '[]'::jsonb END
    ) AS passenger(value)
    WHERE passenger.value->>'id' = $2::text
       OR passenger.value->>'id' ~ ('^' || $2::text || '_companion_[0-9]+$')
  );
$function$;
REVOKE ALL ON FUNCTION public.lobby_json_contains_passenger(JSONB, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.lobby_json_contains_passenger(JSONB, UUID) TO authenticated;

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS accepted_driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.can_rider_view_active_customer_profile(p_customer_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND p_customer_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.users AS rider
      WHERE rider.id = auth.uid()
        AND rider.role = 'rider'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.ride_requests AS ride
        WHERE ride.accepted_driver_id = auth.uid()
          AND ride.customer_id = p_customer_id
          AND lower(replace(ride.status, '_', '-')) IN (
            'accepted', 'on-the-way', 'arrived', 'in-progress',
            'picked-up', 'dropped-off', 'awaiting-payment'
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.shared_ride_lobbies AS lobby
        WHERE lobby.driver_id = auth.uid()
          AND lobby.status IN ('driver_found', 'in_progress')
          AND (
            lobby.customer_id = p_customer_id
            OR p_customer_id::TEXT = ANY(lobby.passengers)
            OR public.lobby_json_contains_passenger(lobby.passengers_json, p_customer_id)
          )
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.can_rider_view_active_customer_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_rider_view_active_customer_profile(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_rider_view_active_customer_profile(UUID) TO authenticated;

DROP POLICY IF EXISTS "Riders can view profiles in their active rides" ON public.users;
CREATE POLICY "Riders can view profiles in their active rides" ON public.users
  FOR SELECT TO authenticated
  USING (public.can_rider_view_active_customer_profile(id));

SELECT 'Drivers can view passenger profiles for their active rides' AS status;
