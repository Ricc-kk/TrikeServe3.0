-- Terminal boundaries are ROADS, not enclosed areas.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- The Super Admin / Rider Admin draws the road a terminal runs along by tapping
-- along it in the terminal add/edit map picker. Each tap is snapped to the nearest
-- real road, and the stored shape is an ordered list of points forming a line:
--   [{"lat":14.7294,"lng":120.9349}, {"lat":14.7301,"lng":120.9360}, ...]
--
-- A line has no interior, so coverage is a CORRIDOR: a drop-off is accepted when
-- it falls within half of `road_width_m` from the plotted line. The check passes
-- if ANY active terminal with a plotted road covers the point, because terminals
-- often share a road.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS road_width_m NUMERIC DEFAULT 200;

COMMENT ON COLUMN terminals.boundary_polygon IS
  'Ordered points along the road this terminal runs, snapped to the road network. A line, not an enclosure.';
COMMENT ON COLUMN terminals.road_width_m IS
  'Full width of the road corridor in metres. A drop-off is accepted within half of this distance of the plotted road.';

-- Give every existing terminal an explicit corridor width, so a NULL from before
-- the migration can't be mistaken for "no road".
UPDATE terminals
SET road_width_m = 200
WHERE road_width_m IS NULL;

-- Clear the old closed-area boundaries. They were traced as enclosures, and
-- treating them as roads would misjudge every drop-off near an edge, so each
-- terminal starts with no road until an admin plots one.
--
-- Terminals with no boundary are ignored by the drop-off check, so bookings keep
-- working while the roads are being redrawn.
UPDATE terminals
SET boundary_polygon = NULL;

-- Let a terminal's road check be switched off without losing the plotted road.
--
-- When false, the road is still stored and still drawn on the map, but this
-- terminal is skipped by the drop-off check — useful while a road is being
-- corrected, or for a terminal whose road is temporarily not being enforced.
-- Defaults to true, so existing rows enforce their road immediately.
ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS boundary_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN terminals.boundary_enabled IS
  'Whether this terminal''s plotted road is enforced on drop-off checks. The road is kept either way.';

UPDATE terminals
SET boundary_enabled = TRUE
WHERE boundary_enabled IS NULL;

-- Print confirmation
SELECT 'Migration completed: terminals now plot roads (road_width_m added, old areas cleared)' as status;
