-- Let a business post an open rider request for its own delivery order only.
-- Run this in the Supabase SQL Editor on an existing project.

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS order_id UUID,
  ADD COLUMN IF NOT EXISTS order_number VARCHAR(20);

ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.ride_requests TO authenticated;

DROP POLICY IF EXISTS "Businesses can create delivery requests for own orders"
  ON public.ride_requests;

CREATE POLICY "Businesses can create delivery requests for own orders"
  ON public.ride_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    order_id IS NOT NULL
    AND ride_type = 'special'
    AND status = 'pending'
    AND driver_id IS NULL
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
        AND lower(business_order.status) IN ('payment-confirmed', 'preparing', 'ready', 'confirmed')
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

-- Businesses need to read delivery requests attached to their own orders so
-- the business order sheet can show the assigned driver's profile.
DROP POLICY IF EXISTS "Businesses can view delivery requests for own orders"
  ON public.ride_requests;

CREATE POLICY "Businesses can view delivery requests for own orders"
  ON public.ride_requests
  FOR SELECT TO authenticated
  USING (
    ride_type = 'special'
    AND order_id IS NOT NULL
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

-- Riders need to see open delivery requests and atomically claim one. A
-- delivery request is a special ride linked to an order; ordinary private
-- ride requests do not have order_id set. The UPDATE check ensures a rider
-- can only claim an unassigned request for their own rider account.
DROP POLICY IF EXISTS "Riders can view open delivery requests" ON public.ride_requests;
CREATE POLICY "Riders can view open delivery requests"
  ON public.ride_requests
  FOR SELECT TO authenticated
  USING (
    ride_type = 'special'
    AND order_id IS NOT NULL
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

DROP POLICY IF EXISTS "Riders can accept open delivery requests" ON public.ride_requests;
CREATE POLICY "Riders can accept open delivery requests"
  ON public.ride_requests
  FOR UPDATE TO authenticated
  USING (
    ride_type = 'special'
    AND order_id IS NOT NULL
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
    AND order_id IS NOT NULL
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

SELECT 'Business delivery request and rider acceptance policies installed' AS status;
