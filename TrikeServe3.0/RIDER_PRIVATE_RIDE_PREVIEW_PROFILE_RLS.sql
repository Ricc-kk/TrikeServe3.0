-- Let authenticated drivers see the profile row for customers with an open
-- private ride, so the driver's route preview can show the passenger's name
-- and profile photo before the ride is accepted.
--
-- This only matches private ride requests: delivery requests have order_id set.
-- RLS limits which user rows are visible; it does not restrict individual
-- columns on an allowed row.

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS accepted_driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.can_rider_view_pending_private_ride_profile(
  p_customer_id UUID
)
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
    AND EXISTS (
      SELECT 1
      FROM public.ride_requests AS ride
      WHERE ride.customer_id = p_customer_id
        AND ride.ride_type = 'special'
        AND ride.order_id IS NULL
        AND ride.status = 'pending'
        AND ride.driver_id IS NULL
        AND ride.accepted_driver_id IS NULL
    );
$function$;

REVOKE ALL ON FUNCTION public.can_rider_view_pending_private_ride_profile(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_rider_view_pending_private_ride_profile(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_rider_view_pending_private_ride_profile(UUID) TO authenticated;

GRANT SELECT ON public.users TO authenticated;

DROP POLICY IF EXISTS "Riders can view profiles for pending private ride previews"
  ON public.users;
CREATE POLICY "Riders can view profiles for pending private ride previews"
  ON public.users
  FOR SELECT TO authenticated
  USING (public.can_rider_view_pending_private_ride_profile(id));

SELECT 'Drivers can view passenger profiles for open private ride previews' AS status;
