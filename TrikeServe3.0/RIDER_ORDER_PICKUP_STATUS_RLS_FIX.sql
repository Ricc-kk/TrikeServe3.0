-- Allow the assigned rider to mark a delivery order picked up without granting
-- direct UPDATE access to the customer's order row. Match legacy requests whose
-- order id only appears in the tagged pickup, and accept either rider id column.
CREATE OR REPLACE FUNCTION public.mark_delivery_order_picked_up(
  p_order_id UUID DEFAULT NULL,
  p_order_number TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_driver_id UUID := auth.uid();
  v_order_id UUID;
BEGIN
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'A signed-in rider is required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.users AS rider
    WHERE rider.id = v_driver_id
      AND lower(rider.role) IN ('rider', 'driver')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Only riders can mark delivery orders picked up';
  END IF;

  IF p_order_id IS NOT NULL THEN
    SELECT order_row.id
      INTO v_order_id
      FROM public.orders AS order_row
      WHERE order_row.id = p_order_id;
  END IF;

  IF v_order_id IS NULL AND p_order_number IS NOT NULL THEN
    SELECT order_row.id
      INTO v_order_id
      FROM public.orders AS order_row
      WHERE order_row.order_number = p_order_number;
  END IF;

  IF v_order_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'Delivery order not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ride_requests AS ride
    WHERE (
        ride.order_id = v_order_id
        OR (
          ride.order_id IS NULL
          AND position(lower('ORDER_ID:' || v_order_id::text) in lower(coalesce(ride.pickup_location, ''))) > 0
        )
      )
      AND (ride.accepted_driver_id = v_driver_id OR ride.driver_id = v_driver_id)
      AND lower(replace(coalesce(ride.status, ''), '_', '-')) NOT IN ('cancelled', 'completed')
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'This rider is not assigned to the delivery order';
  END IF;

  UPDATE public.orders AS order_row
    SET status = 'picked_up',
        updated_at = now()
    WHERE order_row.id = v_order_id
      AND lower(replace(coalesce(order_row.delivery_mode, ''), '_', '-')) = 'delivery'
      AND lower(replace(coalesce(order_row.status, ''), '_', '-')) NOT IN ('delivered', 'cancelled');

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'This delivery order can no longer be marked picked up';
  END IF;

  RETURN TRUE;
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_delivery_order_picked_up(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_delivery_order_picked_up(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.mark_delivery_order_picked_up(UUID, TEXT) TO authenticated;
