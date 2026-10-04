-- Give restaurants a declared cuisine and coordinates.
--
-- Why this exists
-- ---------------
-- The customer food filters (Silugan, Ihawan, Karinderya, ...) were inferred from
-- `menu_items.category`, so a shop was called an "Ihawan" if it sold a single
-- item categorised `chicken`. Two of the buckets ("Kafe" and "Malamig") both
-- mapped to `drinks`, so those two filters could never return different
-- restaurants. There was no way for a business to declare what it actually is.
--
-- `cuisine` is the business-declared answer. `latitude`/`longitude` make
-- "distance to you" computable at all -- the table previously held only a text
-- address, so no distance could ever be derived.

ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS cuisine TEXT[] DEFAULT '{}';
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine ON restaurants USING GIN (cuisine);

-- Backfill from the menu so the filters are not empty on the day this ships.
--
-- This is a best guess from what already exists, not a claim about the shop:
-- businesses refine it in Business settings -> "What we serve". `drinks` is
-- ambiguous (it covered both coffee and cold drinks), so it is filed under
-- `malamig`, the more common use, rather than being copied into both buckets --
-- duplicating it would reintroduce the bug this column exists to fix.
UPDATE restaurants r
SET cuisine = sub.cuisine
FROM (
  SELECT DISTINCT ON (restaurant_id)
         restaurant_id,
         ARRAY_REMOVE(ARRAY[
           CASE WHEN lower(category) = 'silog'    THEN 'silugan'    END,
           CASE WHEN lower(category) = 'chicken'  THEN 'ihawan'     END,
           CASE WHEN lower(category) IN ('pork', 'seafood') THEN 'karinderya' END,
           CASE WHEN lower(category) = 'desserts' THEN 'merienda'   END,
           CASE WHEN lower(category) = 'drinks'   THEN 'malamig'    END
         ], NULL) AS cuisine
  FROM menu_items
  WHERE category IS NOT NULL
  ORDER BY restaurant_id, category
) sub
WHERE r.id = sub.restaurant_id
  AND COALESCE(r.cuisine, '{}') = '{}'
  AND COALESCE(array_length(sub.cuisine, 1), 0) > 0;

-- Restaurants stay visible without coordinates; they simply sort last in
-- distance-based rankings and show "Distance unavailable" instead of a number.
COMMENT ON COLUMN restaurants.cuisine IS 'Business-declared cuisine buckets driving the customer food filters.';
COMMENT ON COLUMN restaurants.latitude IS 'Shop latitude, pinned by the business. NULL until pinned.';
COMMENT ON COLUMN restaurants.longitude IS 'Shop longitude, pinned by the business. NULL until pinned.';