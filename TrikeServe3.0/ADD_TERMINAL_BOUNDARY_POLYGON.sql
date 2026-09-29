-- Add a map-plotted boundary area to terminals.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- The Super Admin / Rider Admin draws a boundary by tapping points on the map in
-- the terminal add/edit form. The shape is stored here as a JSON array of
-- vertices, e.g. [{"lat":14.7294,"lng":120.9349}, {"lat":14.7301,"lng":120.9360}, ...].
--
-- Customer bookings are rejected ("Out of boundary area") when the drop-off
-- point is outside EVERY active terminal that has a plotted boundary. Terminals
-- with a NULL boundary_polygon are ignored, so bookings are never blocked until
-- you actually plot at least one area.

ALTER TABLE terminals
ADD COLUMN IF NOT EXISTS boundary_polygon JSONB DEFAULT NULL;

-- Optional: quickly give the seeded terminals a test area so you can try the
-- feature before plotting your real boundaries. Uncomment, adjust the
-- coordinates, and run if you want it.
--
-- UPDATE terminals SET boundary_polygon = '[
--   {"lat":14.7374,"lng":120.9259},
--   {"lat":14.7374,"lng":120.9439},
--   {"lat":14.7214,"lng":120.9439},
--   {"lat":14.7214,"lng":120.9259}
-- ]'::jsonb WHERE id = 't1';

-- Print confirmation
SELECT 'Migration completed: terminals.boundary_polygon added' as status;
