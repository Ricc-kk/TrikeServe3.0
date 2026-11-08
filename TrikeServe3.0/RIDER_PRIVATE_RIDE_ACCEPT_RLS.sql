-- Allow signed-in riders to see open private ride requests and atomically
-- assign one to themselves when accepting it.
-- Run this in Supabase SQL Editor for an existing project.

ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS accepted_driver_id UUID REFERENCES public.users(id) ON DELETE SET NULL;

GRANT SELECT, UPDATE ON public.ride_requests TO authenticated;

DROP POLICY IF EXISTS "Riders can view open private ride requests"
  ON public.ride_requests;
CREATE POLICY "Riders can view open private ride requests"
  ON public.ride_requests
  FOR SELECT TO authenticated
  USING (
    ride_type = 'special'
    AND order_id IS NULL
    AND status = 'pending'
    AND driver_id IS NULL
    AND accepted_driver_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.users AS rider
      WHERE rider.id = auth.uid()
        AND rider.role = 'rider'
    )
  );

DROP POLICY IF EXISTS "Riders can accept open private ride requests"
  ON public.ride_requests;
CREATE POLICY "Riders can accept open private ride requests"
  ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (
    ride_type = 'special'
    AND order_id IS NULL
    AND status = 'pending'
    AND driver_id IS NULL
    AND accepted_driver_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.users AS rider
      WHERE rider.id = auth.uid()
        AND rider.role = 'rider'
    )
  )
  WITH CHECK (
    ride_type = 'special'
    AND order_id IS NULL
    AND status = 'accepted'
    AND driver_id = auth.uid()
    AND accepted_driver_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS rider
      WHERE rider.id = auth.uid()
        AND rider.role = 'rider'
    )
  );

SELECT 'Riders can view and accept open private ride requests' AS status;
