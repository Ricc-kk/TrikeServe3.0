-- STATUS: NOT APPLIED. Written and reviewed, deliberately left unrun — the queue
-- rule is currently enforced by the client only. Nothing is broken while this is
-- unapplied; it only becomes relevant if you want the rule enforced in the DB too.
-- Run it only after the client change (queue slot released after the ride is
-- recorded) is deployed and tested.
--
-- Server-side enforcement of the terminal queue rule: only the first driver in a
-- terminal's queue may be assigned a private or share ride, so a direct API call
-- can no longer skip the queue.
--
-- This mirrors the client rule in src/app/components/rider/PassengerRequests.tsx:
--   * delivery is never gated  (ride_type = 'delivery' OR a 'DELIVERY|' pickup tag,
--     which is how delivery ride_requests are tagged in this app)
--   * the check is against the DRIVER's own terminal (users.terminal_id), NOT the
--     ride's terminal_id — in this database most ride_requests have terminal_id
--     NULL because the customer never picked a terminal
--   * a driver with no terminal may not be assigned anything
--   * rows that stopped heartbeating are ignored, mirroring STALE_AFTER_MS in
--     src/app/hooks/useTerminalQueue.ts — keep the two values in sync
--
-- !! DEPLOY ORDER — DO NOT REVERSE !!
--   1. Ship the client change first. The queue slot is now released only AFTER
--      the ride is recorded (ActiveRide -> acceptRideRequest -> clear queue), so
--      the driver is still first in queue when these triggers validate.
--   2. Then run this file and immediately test all three accept paths:
--        - a private ride  (PassengerRequests -> ActiveRide)
--        - a share lobby   (acceptLobbyAsDriver)
--        - a delivery      (must NOT be blocked)
--
-- Revert — one statement each, no data touched:
--   DROP TRIGGER IF EXISTS enforce_queue_on_ride_accept ON ride_requests;
--   DROP TRIGGER IF EXISTS enforce_queue_on_lobby_accept ON shared_ride_lobbies;
--   DROP FUNCTION IF EXISTS public.enforce_terminal_queue_on_accept();
--   DROP FUNCTION IF EXISTS public.is_first_in_terminal_queue(text, text);

-- "First" = the oldest non-stale waiting row for that terminal.
CREATE OR REPLACE FUNCTION public.is_first_in_terminal_queue(p_terminal_id TEXT, p_driver_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM terminal_queue q
    WHERE q.terminal_id = p_terminal_id
      AND q.driver_id = p_driver_id
      AND q.status = 'waiting'
      AND q.updated_at >= now() - INTERVAL '10 minutes'
      AND NOT EXISTS (
        SELECT 1
        FROM terminal_queue older
        WHERE older.terminal_id = q.terminal_id
          AND older.status = 'waiting'
          AND older.updated_at >= now() - INTERVAL '10 minutes'
          AND (older.joined_at, older.id) < (q.joined_at, q.id)
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.enforce_terminal_queue_on_accept()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_driver_terminal TEXT;
  v_is_delivery BOOLEAN;
BEGIN
  IF NEW.driver_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Deliveries are not queue-gated (they are tagged either on ride_type or on the
  -- pickup_location prefix, the same way the client's mapRideType() decides).
  IF TG_TABLE_NAME = 'ride_requests' THEN
    v_is_delivery := COALESCE(NEW.ride_type, '') = 'delivery'
                  OR COALESCE(NEW.pickup_location, '') LIKE 'DELIVERY|%';
  ELSE
    v_is_delivery := false;
  END IF;

  -- The gate is per DRIVER terminal, not per ride terminal.
  SELECT u.terminal_id INTO v_driver_terminal
  FROM users u
  WHERE u.id::text = NEW.driver_id::text;

  IF v_driver_terminal IS NULL THEN
    RAISE EXCEPTION 'Terminal queue: driver % has no terminal assigned and cannot accept rides', NEW.driver_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_is_delivery
     AND NOT public.is_first_in_terminal_queue(v_driver_terminal, NEW.driver_id::text) THEN
    RAISE EXCEPTION 'Terminal queue: driver % is not first in the % queue', NEW.driver_id, v_driver_terminal
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- Fires only when a driver is actually being assigned (driver_id NULL -> driver,
-- or a different driver), so ordinary status/driver_status updates are untouched.
CREATE TRIGGER enforce_queue_on_ride_accept
BEFORE UPDATE ON ride_requests
FOR EACH ROW
WHEN (NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id)
EXECUTE FUNCTION public.enforce_terminal_queue_on_accept();

CREATE TRIGGER enforce_queue_on_lobby_accept
BEFORE UPDATE ON shared_ride_lobbies
FOR EACH ROW
WHEN (NEW.driver_id IS NOT NULL AND NEW.driver_id IS DISTINCT FROM OLD.driver_id)
EXECUTE FUNCTION public.enforce_terminal_queue_on_accept();

SELECT 'Terminal queue enforcement installed on ride_requests + shared_ride_lobbies' AS status;
