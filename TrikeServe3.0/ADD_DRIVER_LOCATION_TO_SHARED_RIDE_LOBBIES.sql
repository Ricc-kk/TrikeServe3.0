-- Enable live driver tracking for customer shared-ride maps.
-- Run this migration in the Supabase SQL Editor.

ALTER TABLE public.shared_ride_lobbies
  ADD COLUMN IF NOT EXISTS driver_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS driver_lng DOUBLE PRECISION;

COMMENT ON COLUMN public.shared_ride_lobbies.driver_lat IS
  'Latest driver latitude used by live shared-ride tracking';
COMMENT ON COLUMN public.shared_ride_lobbies.driver_lng IS
  'Latest driver longitude used by live shared-ride tracking';

ALTER TABLE public.shared_ride_lobbies ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON public.shared_ride_lobbies TO authenticated;

-- Allow a signed-in driver to write coordinates only on a lobby assigned to them.
DROP POLICY IF EXISTS "Drivers can update assigned lobbies" ON public.shared_ride_lobbies;
CREATE POLICY "Drivers can update assigned lobbies" ON public.shared_ride_lobbies
  FOR UPDATE TO authenticated
  USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);

NOTIFY pgrst, 'reload schema';
