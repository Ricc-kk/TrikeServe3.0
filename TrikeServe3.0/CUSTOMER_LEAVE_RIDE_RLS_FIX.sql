-- Customer share and private ride leave operations.
-- Run this once in the Supabase SQL Editor for the project's database.
-- The app calls these authenticated RPCs so leaving does not depend on broad
-- client UPDATE policies or on a second read after the customer is removed.

ALTER TABLE public.ride_requests
  ADD COLUMN IF NOT EXISTS driver_status VARCHAR(50),
  ADD COLUMN IF NOT EXISTS driver_status_message TEXT,
  ADD COLUMN IF NOT EXISTS driver_status_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancel_reason TEXT,
  ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20);

ALTER TABLE public.shared_ride_lobbies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.cancel_private_ride_request(
  p_ride_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS TABLE(id UUID, status VARCHAR(50))
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in with your customer account to cancel this private ride.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  UPDATE public.ride_requests AS request
  SET status = 'cancelled',
      driver_status = 'cancelled',
      driver_status_message = CASE
        WHEN v_reason IS NOT NULL THEN 'Customer cancelled the ride: ' || v_reason
        ELSE 'Customer cancelled the ride request.'
      END,
      cancel_reason = v_reason,
      cancelled_by = 'customer',
      updated_at = v_now
  WHERE request.id = p_ride_id
    AND request.customer_id = v_user_id
    AND request.ride_type = 'special'
    AND request.status IN ('pending', 'accepted', 'in_progress')
  RETURNING request.id, request.status;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_private_ride_request(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_private_ride_request(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.cancel_private_ride_request(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.leave_shared_ride_lobby(
  p_lobby_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS SETOF public.shared_ride_lobbies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_reason TEXT := NULLIF(pg_catalog.btrim(COALESCE(p_reason, '')), '');
  v_now TIMESTAMPTZ := pg_catalog.now();
  v_lobby public.shared_ride_lobbies%ROWTYPE;
  v_remaining JSONB;
  v_next_host JSONB;
  v_next_host_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Sign in with your customer account before leaving a share ride.'
      USING ERRCODE = '42501';
  END IF;

  -- Serialize concurrent leave/join/driver updates before changing passengers.
  SELECT lobby.*
  INTO v_lobby
  FROM public.shared_ride_lobbies AS lobby
  WHERE lobby.id = p_lobby_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lobby not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_lobby.status NOT IN ('waiting', 'driver_found', 'in_progress') THEN
    RAISE EXCEPTION 'This ride lobby is already finished.' USING ERRCODE = '55000';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.jsonb_array_elements(
      CASE
        WHEN pg_catalog.jsonb_typeof(v_lobby.passengers_json) = 'array'
          THEN v_lobby.passengers_json
        ELSE '[]'::JSONB
      END
    ) AS passenger(value)
    WHERE passenger.value->>'id' = v_user_id::TEXT
       OR passenger.value->>'id' ~ ('^' || v_user_id::TEXT || '_companion_[0-9]+$')
  ) THEN
    RAISE EXCEPTION 'You are not a passenger in this lobby.' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(passenger.value ORDER BY passenger.ordinality),
    '[]'::JSONB
  )
  INTO v_remaining
  FROM pg_catalog.jsonb_array_elements(
    CASE
      WHEN pg_catalog.jsonb_typeof(v_lobby.passengers_json) = 'array'
        THEN v_lobby.passengers_json
      ELSE '[]'::JSONB
    END
  ) WITH ORDINALITY AS passenger(value, ordinality)
  WHERE COALESCE(passenger.value->>'id', '') <> v_user_id::TEXT
    AND COALESCE(passenger.value->>'id', '') !~ ('^' || v_user_id::TEXT || '_companion_[0-9]+$');

  IF v_lobby.customer_id = v_user_id AND pg_catalog.jsonb_array_length(v_remaining) > 0 THEN
    SELECT passenger.value
    INTO v_next_host
    FROM pg_catalog.jsonb_array_elements(v_remaining) WITH ORDINALITY AS passenger(value, ordinality)
    WHERE COALESCE(passenger.value->>'id', '') !~ '_companion_[0-9]+$'
    ORDER BY passenger.ordinality
    LIMIT 1;

    IF v_next_host IS NULL THEN
      v_next_host := v_remaining->0;
    END IF;

    IF (v_next_host->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_next_host_id := (v_next_host->>'id')::UUID;
    END IF;
  END IF;

  RETURN QUERY
  UPDATE public.shared_ride_lobbies AS lobby
  SET passengers_json = v_remaining,
      status = CASE
        WHEN pg_catalog.jsonb_array_length(v_remaining) = 0 THEN 'cancelled'
        ELSE lobby.status
      END,
      customer_id = CASE
        WHEN v_lobby.customer_id = v_user_id THEN v_next_host_id
        ELSE lobby.customer_id
      END,
      dropoff_location = CASE
        WHEN v_next_host_id IS NOT NULL THEN COALESCE(
          NULLIF(v_next_host->>'dropoff', ''),
          NULLIF(v_next_host->>'dropoffAddress', ''),
          lobby.dropoff_location
        )
        ELSE lobby.dropoff_location
      END,
      dropoff_address = CASE
        WHEN v_next_host_id IS NOT NULL THEN COALESCE(
          NULLIF(v_next_host->>'dropoffAddress', ''),
          NULLIF(v_next_host->>'dropoff', ''),
          lobby.dropoff_address
        )
        ELSE lobby.dropoff_address
      END,
      dropoff_lat = CASE
        WHEN v_next_host_id IS NOT NULL
          AND COALESCE(v_next_host->>'dropoffLat', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          AND COALESCE(v_next_host->>'dropoffLng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN (v_next_host->>'dropoffLat')::DOUBLE PRECISION
        ELSE lobby.dropoff_lat
      END,
      dropoff_lng = CASE
        WHEN v_next_host_id IS NOT NULL
          AND COALESCE(v_next_host->>'dropoffLat', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          AND COALESCE(v_next_host->>'dropoffLng', '') ~ '^-?[0-9]+(\.[0-9]+)?$'
          THEN (v_next_host->>'dropoffLng')::DOUBLE PRECISION
        ELSE lobby.dropoff_lng
      END,
      driver_status = CASE
        WHEN pg_catalog.jsonb_array_length(v_remaining) = 0 AND lobby.driver_id IS NOT NULL
          THEN 'cancelled'
        ELSE lobby.driver_status
      END,
      driver_status_message = CASE
        WHEN pg_catalog.jsonb_array_length(v_remaining) = 0 AND lobby.driver_id IS NOT NULL
          THEN 'The customer cancelled this shared ride. Reason: ' || COALESCE(v_reason, 'No passengers remain in the lobby.')
        WHEN lobby.driver_id IS NOT NULL AND v_reason IS NOT NULL
          THEN 'A passenger left this shared ride. Reason: ' || v_reason
        ELSE lobby.driver_status_message
      END,
      driver_status_updated_at = CASE
        WHEN lobby.driver_id IS NOT NULL
          AND (pg_catalog.jsonb_array_length(v_remaining) = 0 OR v_reason IS NOT NULL)
          THEN v_now
        ELSE lobby.driver_status_updated_at
      END,
      updated_at = v_now
  WHERE lobby.id = p_lobby_id
  RETURNING lobby.*;
END;
$$;

REVOKE ALL ON FUNCTION public.leave_shared_ride_lobby(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leave_shared_ride_lobby(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.leave_shared_ride_lobby(UUID, TEXT) TO authenticated;

COMMENT ON FUNCTION public.cancel_private_ride_request(UUID, TEXT) IS
  'Cancels an active private ride only for its authenticated customer.';
COMMENT ON FUNCTION public.leave_shared_ride_lobby(UUID, TEXT) IS
  'Removes the authenticated passenger and companions from an active shared ride lobby.';
