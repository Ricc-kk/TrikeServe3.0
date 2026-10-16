-- Several routes per terminal.
--
-- A terminal used to have exactly one road (terminals.boundary_polygon) with one
-- corridor width (terminals.road_width_m). A TODA commonly runs more than one --
-- a main road and the lanes either side of it -- and they need different widths,
-- and a road being corrected has to stay saved while it is not yet enforced.
--
-- terminals.routes is that list:
--
--   id        text        stable per route, so the editor can find it again
--   name      text        what the admin called it ("Palivas Rd main")
--   points    jsonb       [{ lat, lng }, ...] -- the same shape boundary_polygon holds
--   buffer_m  numeric     the route's own corridor width; each side gets half
--   enabled   boolean     false keeps a route saved but stops enforcing it
--
-- boundary_polygon and road_width_m are left alone and are kept in step with the
-- FIRST route by the app on every save, so everything written before this
-- migration (the queue hook, the booking gates) keeps answering correctly on a
-- database that has run it and on one that has not.
--
-- The backfill below turns every existing plotted road into that one route, so
-- nothing changes behaviour on the day this runs.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS routes JSONB;

COMMENT ON COLUMN terminals.routes IS
  'The terminal''s routes: [{ id, name, points: [{lat,lng}], buffer_m, enabled }]. A point is accepted within half of buffer_m of any ENABLED route''s points. boundary_polygon / road_width_m mirror the first route.';

-- Every terminal that already has a plotted road gets that road as its one
-- route. Written as a JSON string because the app writes the column as jsonb
-- text too, and both sides must agree on the shape.
UPDATE terminals
SET routes = jsonb_build_array(
  jsonb_build_object(
    'id', 'r_legacy',
    'name', 'Main route',
    'points', boundary_polygon,
    'buffer_m', COALESCE(road_width_m, 200),
    'enabled', true
  )
)
WHERE routes IS NULL
  AND boundary_polygon IS NOT NULL
  AND jsonb_array_length(
    CASE
      WHEN jsonb_typeof(boundary_polygon) = 'array' THEN boundary_polygon
      ELSE '[]'::jsonb
    END
  ) >= 2;

-- The route gate reads every terminal on each check, and the editor reads them
-- on every screen it opens, so the column is worth its own index for existence.
CREATE INDEX IF NOT EXISTS idx_terminals_routes ON terminals USING GIN (routes jsonb_path_ops);

SELECT 'Migration completed: terminals.routes added and backfilled from boundary_polygon' AS status;