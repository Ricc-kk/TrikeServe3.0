-- Allow a signed-in customer to create a private ride request for their own
-- account and read it back from the INSERT ... SELECT booking call.
-- Run this in the Supabase SQL Editor for an existing database.
-- The current app cancels rides through an RPC; also run CUSTOMER_LEAVE_RIDE_RLS_FIX.sql.

ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;

GRANT INSERT, SELECT, UPDATE ON public.ride_requests TO authenticated;

-- Remove the known broad/legacy insert policies before installing the scoped
-- policy. Other read/update policies are left intact for driver workflows.
DROP POLICY IF EXISTS "Anyone can insert ride requests" ON public.ride_requests;
DROP POLICY IF EXISTS "Authenticated users can manage ride requests" ON public.ride_requests;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.ride_requests;
DROP POLICY IF EXISTS "Users can insert their own ride requests" ON public.ride_requests;
DROP POLICY IF EXISTS "Customers can create own private ride requests" ON public.ride_requests;

CREATE POLICY "Customers can create own private ride requests" ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    customer_id = auth.uid()
    AND ride_type = 'special'
    AND status = 'pending'
    AND driver_id IS NULL
  );

-- Preserve the driver's existing shared-ride completion history write after
-- removing the old open INSERT policy.
DROP POLICY IF EXISTS "Riders can record completed shared rides" ON public.ride_requests;
CREATE POLICY "Riders can record completed shared rides" ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    ride_type = 'share'
    AND status = 'completed'
    AND driver_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.users AS rider
      WHERE rider.id = auth.uid()
        AND rider.role = 'rider'
        AND rider.is_verified IS TRUE
    )
  );

-- Supabase requires SELECT access when the client requests the created row
-- with .insert(...).select().single(). This exposes only the caller's rows.
GRANT SELECT ON public.ride_requests TO authenticated;
DROP POLICY IF EXISTS "Customers can view own ride requests" ON public.ride_requests;
CREATE POLICY "Customers can view own ride requests" ON public.ride_requests
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

-- Customers may cancel their own active private ride. The row remains visible
-- through the SELECT policy above so UPDATE ... RETURNING can return the result.
DROP POLICY IF EXISTS "Customers can cancel own private ride requests" ON public.ride_requests;
CREATE POLICY "Customers can cancel own private ride requests" ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid()
    AND ride_type = 'special'
    AND status IN ('pending', 'accepted', 'in_progress')
  )
  WITH CHECK (
    customer_id = auth.uid()
    AND ride_type = 'special'
    AND status = 'cancelled'
  );

DROP POLICY IF EXISTS "Riders can view assigned ride requests" ON public.ride_requests;
CREATE POLICY "Riders can view assigned ride requests" ON public.ride_requests
  FOR SELECT TO authenticated
  USING (driver_id = auth.uid());

SELECT 'Private ride booking RLS policies installed' AS status;
