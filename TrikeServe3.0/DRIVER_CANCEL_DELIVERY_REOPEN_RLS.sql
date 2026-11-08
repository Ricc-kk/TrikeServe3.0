-- Let an assigned driver return a delivery to the open driver queue before
-- pickup. The order stays active and the current ride_requests row is reused.
-- Run this script in Supabase SQL Editor.

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20);

CREATE OR REPLACE FUNCTION public.reopen_delivery_request_after_driver_cancellation(
  p_ride_request_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  v_user_id UUID := auth.uid();
  v_request public.ride_requests%ROWTYPE;
  v_order_status TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Sign in as the assigned driver to reopen this delivery.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS rider
    WHERE rider.id = v_user_id
      AND rider.role IN ('rider', 'driver')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only a driver can reopen this delivery request.';
  END IF;

  SELECT *
  INTO v_request
  FROM public.ride_requests AS request
  WHERE request.id = p_ride_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The delivery request could not be found.';
  END IF;

  IF v_request.ride_type <> 'special'
    OR v_request.order_id IS NULL
    OR pg_catalog.lower(pg_catalog.replace(COALESCE(v_request.status, ''), '_', '-')) NOT IN ('accepted', 'on-the-way')
    OR (v_request.driver_id IS DISTINCT FROM v_user_id AND v_request.accepted_driver_id IS DISTINCT FROM v_user_id)
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This delivery is no longer assigned to you.';
  END IF;

  IF pg_catalog.lower(pg_catalog.replace(COALESCE(v_request.driver_status, ''), '_', '-'))
    IN ('picked-up', 'in-progress', 'dropped-off', 'awaiting-payment', 'completed')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This order has already been picked up and cannot return to driver search.';
  END IF;

  SELECT business_order.status
  INTO v_order_status
  FROM public.orders AS business_order
  WHERE business_order.id = v_request.order_id
    AND business_order.customer_id = v_request.customer_id
    AND (v_request.order_number IS NULL OR business_order.order_number = v_request.order_number)
    AND pg_catalog.lower(COALESCE(business_order.delivery_mode, '')) = 'delivery'
  FOR UPDATE OF business_order;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'The active food order linked to this delivery could not be found.';
  END IF;

  IF pg_catalog.lower(pg_catalog.replace(COALESCE(v_order_status, ''), '_', '-'))
    IN ('picked-up', 'out-for-delivery', 'delivered', 'completed', 'cancelled')
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'This order has already been picked up and cannot return to driver search.';
  END IF;

  UPDATE public.ride_requests
  SET status = 'pending',
      driver_id = NULL,
      accepted_driver_id = NULL,
      accepted_at = NULL,
      driver_name = NULL,
      driver_photo = NULL,
      driver_plate = NULL,
      driver_rating = NULL,
      driver_lat = NULL,
      driver_lng = NULL,
      driver_status = NULL,
      driver_status_message = NULL,
      driver_status_updated_at = NULL,
      cancel_reason = NULL,
      cancelled_by = NULL,
      updated_at = pg_catalog.now()
  WHERE id = v_request.id;

  RETURN v_request.id;
END;
$function$;

REVOKE ALL ON FUNCTION public.reopen_delivery_request_after_driver_cancellation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reopen_delivery_request_after_driver_cancellation(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.reopen_delivery_request_after_driver_cancellation(UUID) TO authenticated;

SELECT 'Assigned drivers can return pre-pickup deliveries to the open driver queue' AS status;
