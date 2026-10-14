-- Add a per-terminal marker colour.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- Every terminal gets its own colour for its icon on the Terminal Location map
-- and in the legend beside it. Storing it per terminal (rather than as one
-- app-wide setting) is what lets an admin tell neighbouring TODAs apart on a
-- map where the icons sit close enough to overlap.
--
-- The colour is presentation only: it is never used in a drop-off or driver-queue
-- check, so changing it has no effect on how the terminal behaves.
--
-- Terminals without a value get the default, which matches the icon artwork.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS marker_color TEXT NOT NULL DEFAULT '#2E75B6';

COMMENT ON COLUMN terminals.marker_color IS
  'Hex colour for this terminal''s icon on the Terminal Location map. Presentation only; not used in boundary checks.';

-- Repair any row the ADD COLUMN could not default (a pre-existing column added
-- without a default, or a NULL written before this migration) before the
-- constraint below would reject it.
UPDATE terminals
   SET marker_color = '#2E75B6'
 WHERE marker_color IS NULL
    OR marker_color !~ '^#[0-9A-Fa-f]{6}$';

-- Make bad data impossible. The app sanitises on the way in too; this is the
-- backstop for anything written by SQL, the seed file, or a future migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'terminals_marker_color_hex'
  ) THEN
    ALTER TABLE terminals
      ADD CONSTRAINT terminals_marker_color_hex
      CHECK (marker_color ~ '^#[0-9A-Fa-f]{6}$');
  END IF;
END $$;

-- Print confirmation
SELECT 'Migration completed: terminals.marker_color added' as status;
