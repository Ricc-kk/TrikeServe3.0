-- Add driver tracking columns to the orders table.
--
-- The rider app (ActiveRide.tsx) writes driver_lat/driver_lng/driver_name onto
-- the order while a delivery is in progress, and the customer/business order
-- pages read them to draw the live tracking map. Only ride_requests had these
-- columns, so those writes silently failed and the maps never appeared.
--
-- Run this once in the Supabase SQL editor.

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS driver_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS driver_lng DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS driver_name TEXT;

-- Speed up the tracking lookups.
CREATE INDEX IF NOT EXISTS idx_orders_driver_location ON orders(driver_lat, driver_lng);

-- Backfill the latest known driver position from the delivery's ride request so
-- already in-flight orders start showing on the map.
UPDATE orders o
SET driver_lat = r.driver_lat,
    driver_lng = r.driver_lng,
    driver_name = COALESCE(o.driver_name, r.driver_name)
FROM ride_requests r
WHERE r.order_id = o.id
  AND r.driver_lat IS NOT NULL
  AND o.driver_lat IS NULL;

SELECT 'Migration completed: added driver_lat/driver_lng/driver_name to orders' AS status;
