-- Let a business declare what it serves at sign-up.
--
-- `restaurants.cuisine` already exists (ADD_RESTAURANT_CUISINE_AND_LOCATION.sql)
-- and is the value the customer filter rail matches on. But nothing wrote it
-- until a business opened its settings modal, so every shop was invisible to
-- every cuisine filter on the day it registered.
--
-- The answer given at sign-up is kept on the owner so it is available when the
-- `restaurants` row is first created -- which happens lazily, the first time
-- the business opens its menu or shop screen, not during registration.
--
-- Run this in Supabase's SQL Editor. It is idempotent.

ALTER TABLE users ADD COLUMN IF NOT EXISTS business_cuisine TEXT[] DEFAULT '{}';

-- Seed any business that registered before this column existed, from the
-- categories its menu already uses. Same majority rule the app applies at
-- runtime: one item called `chicken` does not make a shop a chicken shop.
-- Nothing is overwritten, so a shop that already picked its own tags keeps them.

UPDATE users u
SET business_cuisine = sub.cuisine
FROM (
  SELECT
    r.business_user_id,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN c.cat = 'silog'     THEN 'rice'      END,
      CASE WHEN c.cat = 'chicken'   THEN 'chicken'   END,
      CASE WHEN c.cat = 'pork'      THEN 'pork'      END,
      CASE WHEN c.cat = 'beef'      THEN 'beef'      END,
      CASE WHEN c.cat = 'seafood'   THEN 'seafood'   END,
      CASE WHEN c.cat = 'desserts'  THEN 'desserts'  END,
      CASE WHEN c.cat = 'drinks'    THEN 'beverages' END,
      CASE WHEN c.cat = 'coffee'    THEN 'coffee'    END,
      CASE WHEN c.cat = 'tea'       THEN 'coffee'    END,
      CASE WHEN c.cat = 'bakery'    THEN 'bread'     END,
      CASE WHEN c.cat = 'noodles'   THEN 'noodles'   END,
      CASE WHEN c.cat = 'pasta'     THEN 'noodles'   END,
      CASE WHEN c.cat = 'fastfood'  THEN 'sandwiches' END,
      CASE WHEN c.cat = 'burger'    THEN 'sandwiches' END,
      CASE WHEN c.cat = 'snacks'    THEN 'fried'     END
    ], NULL) AS cuisine
  FROM (
    SELECT DISTINCT ON (mi.restaurant_id)
           mi.restaurant_id, lower(btrim(mi.category)) AS cat
    FROM menu_items mi
    WHERE mi.category IS NOT NULL AND btrim(mi.category) <> ''
    ORDER BY mi.restaurant_id, lower(btrim(mi.category))
  ) c
  JOIN restaurants r ON r.id = c.restaurant_id
  WHERE r.business_user_id IS NOT NULL
) sub
WHERE u.id = sub.business_user_id
  AND COALESCE(u.business_cuisine, '{}') = '{}'
  AND COALESCE(array_length(sub.cuisine, 1), 0) > 0;

COMMENT ON COLUMN users.business_cuisine IS
  'What the business declared it serves at sign-up. Seeds restaurants.cuisine when the shop record is first created.';
