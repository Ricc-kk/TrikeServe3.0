-- Add per-terminal colours for the two plotted shapes.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- A terminal is drawn on the Terminal Location map in three colours, all editable
-- per terminal from the editor's Configuration section:
--
--   marker_color   the terminal icon
--   route_color    the road the terminal runs along (the polyline)
--   border_color   the area that encloses that road (the polygon)
--
-- Separate columns rather than one because a single terminal often needs its road
-- to read differently from the area around it — a dark route on a pale fill, say —
-- and because neighbouring TODAs are told apart mostly by their route colour.
--
-- Presentation only. No drop-off or driver-queue check reads any of them.
--
-- Defaults match what the app drew before these columns existed, so existing
-- terminals look the same until someone changes them.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS route_color TEXT NOT NULL DEFAULT '#22C55E',
  ADD COLUMN IF NOT EXISTS border_color TEXT NOT NULL DEFAULT '#22C55E';

COMMENT ON COLUMN terminals.route_color IS
  'Hex colour for the terminal''s road on the location map. Presentation only; not used in boundary checks.';

COMMENT ON COLUMN terminals.border_color IS
  'Hex colour for the terminal''s border area on the location map. Presentation only; not used in boundary checks.';

-- Repair rows the ADD COLUMN could not default before the constraints reject them.
UPDATE terminals SET route_color  = '#22C55E' WHERE route_color  IS NULL OR route_color  !~ '^#[0-9A-Fa-f]{6}$';
UPDATE terminals SET border_color = '#22C55E' WHERE border_color IS NULL OR border_color !~ '^#[0-9A-Fa-f]{6}$';

-- Same backstop as terminals_marker_color_hex: the app sanitises on the way in,
-- this makes it impossible for SQL, a seed file or a future migration to break it.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terminals_route_color_hex') THEN
    ALTER TABLE terminals
      ADD CONSTRAINT terminals_route_color_hex
      CHECK (route_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'terminals_border_color_hex') THEN
    ALTER TABLE terminals
      ADD CONSTRAINT terminals_border_color_hex
      CHECK (border_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

-- Print confirmation
SELECT 'Migration completed: terminals.route_color and terminals.border_color added' as status;
