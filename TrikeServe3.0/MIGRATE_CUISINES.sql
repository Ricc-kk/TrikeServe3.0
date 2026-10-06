-- Move stored restaurants off the seven removed cuisine ids.
--
-- Why this exists
-- ---------------
-- The customer filter rail matches on `restaurants.cuisine`. The seven values it
-- used to understand were shop archetypes -- silugan, ihawan, karinderya,
-- kape, merienda, malamig, fastfood -- which only describe a silog shop. A
-- milk tea stall, a bakery and a barbecue place had nowhere to go, so a
-- category called `drinks` was filed under "Malamig", which is a guess dressed
-- up as a declaration.
--
-- They are replaced by sixteen food-type buckets. This rewrites what is
-- already stored so those shops keep showing up under the filter that matches
-- them, instead of silently vanishing from a list they were always on.
--
-- The mapping is duplicated in src/lib/foodTaxonomy.ts as CUISINE_MIGRATION,
-- and the app applies it on read as well. The two agree, so this file is not
-- required to have run for the app to behave -- it is here so the data is
-- correct without the app in the loop.
--
-- Run AFTER ADD_BUSINESS_CUISINE.sql. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. Rewrite every declared id
-- ---------------------------------------------------------------------------
-- Element by element: an array is exploded, mapped through a VALUES list,
-- then rebuilt. Mapping the whole array in one CASE would only rewrite the
-- first element, because a CASE cannot return an array per element.

CREATE TEMP TABLE cuisine_map (old_id TEXT PRIMARY KEY, new_id TEXT) ON COMMIT DROP;
INSERT INTO cuisine_map (old_id, new_id) VALUES
  ('silugan',   'rice'),
  ('ihawan',    'chicken'),
  ('karinderya','filipino'),
  ('kape',      'coffee'),
  ('merienda',  'desserts'),
  ('malamig',   'beverages'),
  ('fastfood',  'sandwiches');

WITH exploded AS (
  SELECT r.id AS restaurant_id, (u).old_id
  FROM restaurants r
  CROSS JOIN LATERAL unnest(COALESCE(r.cuisine, '{}'::text[])) AS u(old_id)
),
mapped AS (
  SELECT e.restaurant_id, m.new_id
  FROM exploded e
  JOIN cuisine_map m ON m.old_id = e.old_id
),
-- A shop filed as both silugan and ihawan would otherwise end up with rice and
-- chicken from one rewrite and ihawan from the next; rebuild from the mapped
-- set only so every id is a current one exactly once.
rebuilt AS (
  SELECT
    e.restaurant_id,
    ARRAY(
      SELECT DISTINCT COALESCE(m.new_id, e.old_id)
      FROM exploded e2
      LEFT JOIN cuisine_map m ON m.old_id = e2.old_id
      WHERE e2.restaurant_id = e.restaurant_id
    ) AS cuisine
  FROM exploded e
  GROUP BY e.restaurant_id
)
UPDATE restaurants r
SET cuisine = b.cuisine, updated_at = now()
FROM rebuilt b
WHERE r.id = b.restaurant_id
  AND r.cuisine IS DISTINCT FROM b.cuisine;

-- ---------------------------------------------------------------------------
-- 2. Backfill shops that never declared anything
-- ---------------------------------------------------------------------------
-- A shop with an empty array is invisible to every filter. Infer from its menu
-- using the same legacy categories the app falls back to, and only where most
-- of the menu agrees -- otherwise an inferred tag is a wrong claim about a shop
-- that has not been asked.

UPDATE restaurants r
SET cuisine = sub.cuisine, updated_at = now()
FROM (
  SELECT
    restaurant_id,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c.cat = 'silog'     THEN 'rice'       END,
      CASE WHEN c.cat = 'chicken'   THEN 'chicken'    END,
      CASE WHEN c.cat = 'pork'      THEN 'pork'       END,
      CASE WHEN c.cat = 'beef'      THEN 'beef'       END,
      CASE WHEN c.cat = 'seafood'   THEN 'seafood'    END,
      CASE WHEN c.cat = 'desserts'  THEN 'desserts'   END,
      CASE WHEN c.cat = 'drinks'    THEN 'beverages'  END,
      CASE WHEN c.cat = 'coffee'    THEN 'coffee'     END,
      CASE WHEN c.cat = 'bakery'    THEN 'bread'      END,
      CASE WHEN c.cat = 'noodles'   THEN 'noodles'    END,
      CASE WHEN c.cat = 'pasta'     THEN 'noodles'    END,
      CASE WHEN c.cat = 'fastfood'  THEN 'sandwiches' END,
      CASE WHEN c.cat = 'burger'    THEN 'sandwiches' END,
      CASE WHEN c.cat = 'snacks'    THEN 'fried'      END
    ], NULL) AS cuisine
  FROM (
    SELECT mi.restaurant_id, lower(btrim(mi.category)) AS cat, COUNT(*) AS n
    FROM menu_items mi
    WHERE mi.category IS NOT NULL AND btrim(mi.category) <> ''
    GROUP BY mi.restaurant_id, lower(btrim(mi.category))
  ) c
  JOIN (
    SELECT restaurant_id, COUNT(*) AS total
    FROM menu_items
    GROUP BY restaurant_id
  ) t ON t.restaurant_id = c.restaurant_id
  -- Majority, matching inferCuisineFromMenu in the app.
  WHERE c.n::numeric / t.total >= 0.5
) sub
WHERE r.id = sub.restaurant_id
  AND COALESCE(r.cuisine, '{}') = '{}'
  AND COALESCE(array_length(sub.cuisine, 1), 0) > 0;

SELECT 'Migration completed: restaurant cuisine values moved to the 16 food-type buckets' as status;
