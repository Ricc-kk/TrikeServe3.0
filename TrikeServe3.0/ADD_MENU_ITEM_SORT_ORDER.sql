-- Dish order
--
-- Why this file exists
-- --------------------
-- Dragging a dish to a new place in the menu is only worth having if the order
-- survives a reload. It could not: `menu_items` had no order column, so a drag
-- could only ever shuffle an array in the browser, and the next page load read the
-- rows back in whatever order Postgres felt like returning them.
--
-- That is worse than having no drag at all — it looks like it saved, and it did not.
--
-- `menu_sections.sort_order` already exists and is why categories could be reordered
-- and keep the order. This is the same idea one level down.
--
-- Default 0 rather than NOT NULL: existing rows all land on 0 and keep their
-- current relative order, because ties fall through to `created_at`.
--
-- Idempotent: safe to re-run.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- The list is always read as "one restaurant's menu, in order", so that is the
-- shape the index should match.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_sort
  ON menu_items(restaurant_id, sort_order);

COMMENT ON COLUMN menu_items.sort_order IS
  'Position within the restaurant menu, lowest first. Ties fall back to created_at.';

-- Backfill so existing rows get a real sequence rather than a wall of zeros.
-- Row number over each restaurant's menu, oldest first — which is the order the
-- shop has been looking at all along.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY restaurant_id
           ORDER BY created_at ASC, id ASC
         ) - 1 AS position
    FROM menu_items
)
UPDATE menu_items m
   SET sort_order = ranked.position
  FROM ranked
 WHERE m.id = ranked.id
   AND m.sort_order IS DISTINCT FROM ranked.position;

-- Verify: should list the column and its default.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'menu_items'
   AND column_name = 'sort_order';