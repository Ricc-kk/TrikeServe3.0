-- Allow a business to cancel its current delivery assignment before the driver
-- reaches the restaurant. The order stays active; the app creates a fresh open
-- ride request after this row is cancelled.
-- Run in the Supabase SQL Editor.

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS order_number VARCHAR(20),
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20);

GRANT SELECT, INSERT, UPDATE ON public.ride_requests TO authenticated;

DROP POLICY IF EXISTS "Businesses can cancel pre-arrival delivery assignments"
  ON public.ride_requests;

CREATE POLICY "Businesses can cancel pre-arrival delivery assignments"
  ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (
    ride_requests.order_id IS NOT NULL
    AND ride_requests.ride_type = 'special'
    AND lower(replace(coalesce(ride_requests.status, ''), '_', '-'))
      IN ('accepted', 'on-the-way')
    AND ride_requests.driver_id IS NOT NULL
    AND ride_requests.accepted_driver_id = ride_requests.driver_id
    AND (
      coalesce(trim(ride_requests.driver_status), '') = ''
      OR lower(replace(trim(ride_requests.driver_status), '_', '-')) IN (
        'pending', 'assigned', 'accepted', 'on-the-way',
        'heading-to-restaurant', 'en-route-to-restaurant', 'on-the-way-to-pickup'
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.users AS business_user
      WHERE business_user.id = auth.uid()
        AND business_user.role = 'business'
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders AS business_order
      WHERE business_order.id = ride_requests.order_id
        AND business_order.customer_id = ride_requests.customer_id
        AND (
          ride_requests.order_number IS NULL
          OR business_order.order_number = ride_requests.order_number
        )
        AND lower(business_order.delivery_mode) = 'delivery'
        AND lower(replace(coalesce(business_order.status, ''), '_', '-')) NOT IN (
          'picked-up', 'on-the-way', 'delivered', 'completed', 'cancelled'
        )
        AND (
          business_order.business_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.restaurants AS shop
            WHERE shop.business_user_id = auth.uid()
              AND business_order.restaurant_email = shop.id::text
          )
        )
    )
  )
  WITH CHECK (
    ride_requests.order_id IS NOT NULL
    AND ride_requests.ride_type = 'special'
    AND ride_requests.status = 'cancelled'
    AND ride_requests.driver_status = 'cancelled'
    AND ride_requests.cancelled_by = 'business'
    -- Keep the old assignment on its cancelled row. The driver can read that
    -- row and immediately leave Active Ride, while the new request is unassigned.
    AND ride_requests.driver_id IS NOT NULL
    AND ride_requests.accepted_driver_id = ride_requests.driver_id
    AND EXISTS (
      SELECT 1
      FROM public.users AS business_user
      WHERE business_user.id = auth.uid()
        AND business_user.role = 'business'
    )
    AND EXISTS (
      SELECT 1
      FROM public.orders AS business_order
      WHERE business_order.id = ride_requests.order_id
        AND business_order.customer_id = ride_requests.customer_id
        AND (
          ride_requests.order_number IS NULL
          OR business_order.order_number = ride_requests.order_number
        )
        AND lower(business_order.delivery_mode) = 'delivery'
        AND lower(replace(coalesce(business_order.status, ''), '_', '-')) NOT IN (
          'picked-up', 'on-the-way', 'delivered', 'completed', 'cancelled'
        )
        AND (
          business_order.business_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM public.restaurants AS shop
            WHERE shop.business_user_id = auth.uid()
              AND business_order.restaurant_email = shop.id::text
          )
        )
    )
  );

SELECT 'Businesses may cancel their assigned delivery driver before restaurant arrival' AS status;
