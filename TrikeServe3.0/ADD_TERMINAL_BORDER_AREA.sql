-- Add a plotted BORDER AREA that encloses a terminal's road.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- A terminal has two plotted shapes:
--
--   boundary_polygon  the road it runs along (a line, snapped to the road network)
--   boundary_area     a closed polygon enclosing that road — the service area
--
-- The polygon is the outer bound: the road runs through it. A point is accepted
-- when it falls inside the polygon OR within the road corridor, so a driver or
-- customer standing on the road is never rejected by a hand-drawn edge that cut
-- a corner. Terminals with only one of the two plotted still work — a road with
-- no area behaves as it did before, and an area with no road is checked on the
-- polygon alone.
--
-- Terminals with neither shape plotted are ignored, so this never blocks
-- bookings until an admin actually draws something.
--
-- `boundary_enabled` (ADD_TERMINAL_ROAD_BOUNDARY.sql) switches BOTH shapes off
-- for a terminal at once, without discarding either one.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS boundary_area JSONB DEFAULT NULL;

COMMENT ON COLUMN terminals.boundary_area IS
  'Closed polygon enclosing the terminal''s road. Needs at least 3 points. Accepted along with the road corridor.';

-- Print confirmation
SELECT 'Migration completed: terminals.boundary_area added' as status;
