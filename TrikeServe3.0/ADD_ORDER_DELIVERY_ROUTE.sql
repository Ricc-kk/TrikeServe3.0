-- Let a food order carry the terminal that will deliver it, and the coordinates
-- that terminal was chosen for.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- A delivery is routed, not walked: the shop accepts the order, it becomes ready
-- for delivery, and at that point it is handed to the terminal nearest the
-- restaurant among those whose route actually reaches the customer. Recording
-- the decision on the order is what makes that choice auditable instead of
-- "whichever driver happened to be free".
--
-- The coordinates are what the choice was made from. They are stored rather than
-- re-derived later, because `orders.address` packs the text and the point into a
-- single `full|lat,lng` string, which cannot be queried. Re-parsing it at
-- delivery time would also mean re-running the route check against boundaries
-- that may have been redrawn since the order was placed -- the order should keep
-- the answer it was given.
--
-- All three columns are nullable: orders placed before this migration, and
-- orders for addresses with no coordinates, simply have no route recorded.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS terminal_id TEXT,
  ADD COLUMN IF NOT EXISTS dropoff_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS dropoff_lng DOUBLE PRECISION;

COMMENT ON COLUMN orders.terminal_id IS
  'Terminal assigned to deliver this order. Chosen as the terminal nearest the restaurant among those whose route reaches the customer.';

COMMENT ON COLUMN orders.dropoff_lat IS
  'Delivery address latitude, captured at checkout when the route check was run.';

COMMENT ON COLUMN orders.dropoff_lng IS
  'Delivery address longitude, captured at checkout when the route check was run.';

-- The business owner's "ready for delivery" screen looks up orders waiting to be
-- routed, and riders look up the ones assigned to them.
CREATE INDEX IF NOT EXISTS idx_orders_terminal_id ON orders(terminal_id);
CREATE INDEX IF NOT EXISTS idx_orders_status_terminal ON orders(status, terminal_id);

-- Keep the coordinates honest. A row with one but not the other cannot be
-- plotted or measured against a route, and a latitude outside the real world is
-- always a bug rather than a customer standing somewhere odd.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_dropoff_coords_pair'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_dropoff_coords_pair
      CHECK (
        (dropoff_lat IS NULL AND dropoff_lng IS NULL)
        OR (dropoff_lat IS NOT NULL AND dropoff_lng IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_dropoff_lat_range'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_dropoff_lat_range
      CHECK (dropoff_lat IS NULL OR dropoff_lat BETWEEN -90 AND 90);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'orders_dropoff_lng_range'
  ) THEN
    ALTER TABLE orders
      ADD CONSTRAINT orders_dropoff_lng_range
      CHECK (dropoff_lng IS NULL OR dropoff_lng BETWEEN -180 AND 180);
  END IF;
END $$;

SELECT 'Migration completed: orders.terminal_id, dropoff_lat, dropoff_lng added' as status;