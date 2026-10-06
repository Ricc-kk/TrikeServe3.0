-- Let a business group its menu into named folders ("For you", "Rice Meals",
-- "Drinks"), the way the storefront should then present it.
--
-- Why this exists
-- ---------------
-- `menu_items.category` was the only grouping, and it was doing two jobs at
-- once: it ordered the storefront, and it was what a customer picked from the
-- filter rail. That left a business no way to say "these are my recommendations"
-- or "put the bestsellers first" without renaming every category and losing the
-- customers who filtered on it. Sections are a separate, ordered layer that
-- changes the shape of the menu without renaming anything.
--
-- Existing menus are not restructured: one section is created per category the
-- shop already uses, and items are linked to it, so a shop that upgrades keeps
-- the exact menu it had -- just under named headings.
--
-- Run this in Supabase's SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- 1. The categories table the app has always queried
-- ---------------------------------------------------------------------------
-- This table is read by BusinessMenu and RestaurantDetail but has never had a
-- migration in the repository, so a fresh database has no such table and the
-- menu screen silently falls back to localStorage. Guarded so this is a no-op
-- against an existing one.
--
-- Note the composite key: the app derives an id by slugifying the name
-- ("Fried Rice" -> "fried-rice"), so the same slug legitimately exists under
-- many restaurants and id alone cannot be the primary key.

CREATE TABLE IF NOT EXISTS categories (
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (restaurant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_categories_restaurant ON categories(restaurant_id);

-- ---------------------------------------------------------------------------
-- 2. Sections
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS menu_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (btrim(name) <> ''),
  -- Explicit order rather than alphabetical: "For you" belongs above
  -- "Rice Meals" and must be able to stay there.
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Two shops may both have a "Drinks" section; one shop may not have two.
CREATE UNIQUE INDEX IF NOT EXISTS menu_sections_restaurant_name_uniq
  ON menu_sections (restaurant_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_menu_sections_restaurant
  ON menu_sections (restaurant_id, sort_order);

-- ---------------------------------------------------------------------------
-- 3. Link items to a section
-- ---------------------------------------------------------------------------
-- Nullable on purpose. Deleting a section must not delete food, so the column
-- is ON DELETE SET NULL and an unfiled item falls back to an implicit group
-- rather than disappearing.

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS section_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'menu_items_section_id_fkey'
  ) THEN
    ALTER TABLE menu_items
      ADD CONSTRAINT menu_items_section_id_fkey
      FOREIGN KEY (section_id) REFERENCES menu_sections(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_menu_items_section ON menu_items(section_id);

-- ---------------------------------------------------------------------------
-- 4. Row level security, matching menu_items
-- ---------------------------------------------------------------------------

ALTER TABLE menu_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage menu sections" ON menu_sections;
CREATE POLICY "Service role can manage menu sections" ON menu_sections
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Businesses can manage their own menu sections" ON menu_sections;
CREATE POLICY "Businesses can manage their own menu sections" ON menu_sections
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = restaurant_id
      AND restaurants.business_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Customers can view menu sections" ON menu_sections;
CREATE POLICY "Customers can view menu sections" ON menu_sections
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can view categories" ON categories;
CREATE POLICY "Anyone can view categories" ON categories
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Businesses can manage their own categories" ON categories;
CREATE POLICY "Businesses can manage their own categories" ON categories
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = restaurant_id
      AND restaurants.business_user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. Backfill: one section per existing category
-- ---------------------------------------------------------------------------
-- Ordered by name so a shop's menu arrives in a stable, readable shape rather
-- than an arbitrary one.

INSERT INTO menu_sections (restaurant_id, name, sort_order)
SELECT c.restaurant_id, c.category, c.rn
FROM (
  SELECT
    mi.restaurant_id,
    btrim(mi.category) AS category,
    ROW_NUMBER() OVER (
      PARTITION BY mi.restaurant_id
      ORDER BY lower(btrim(mi.category))
    ) AS rn
  FROM menu_items mi
  WHERE mi.category IS NOT NULL AND btrim(mi.category) <> ''
  GROUP BY mi.restaurant_id, btrim(mi.category)
) c
WHERE NOT EXISTS (
  SELECT 1 FROM menu_sections s
  WHERE s.restaurant_id = c.restaurant_id
    AND lower(s.name) = lower(c.category)
);

UPDATE menu_items mi
SET section_id = s.id
FROM menu_sections s
WHERE s.restaurant_id = mi.restaurant_id
  AND lower(s.name) = lower(btrim(mi.category))
  AND mi.section_id IS NULL;

-- Anything still unfiled (a restaurant with items but no usable category)
-- gets one neutral heading rather than being left off the storefront.

INSERT INTO menu_sections (restaurant_id, name, sort_order)
SELECT r.id, 'Menu', 0
FROM restaurants r
WHERE EXISTS (
  SELECT 1 FROM menu_items mi
  WHERE mi.restaurant_id = r.id AND mi.section_id IS NULL
)
AND NOT EXISTS (
  SELECT 1 FROM menu_sections s
  WHERE s.restaurant_id = r.id AND lower(s.name) = 'menu'
);

UPDATE menu_items mi
SET section_id = s.id
FROM menu_sections s, restaurants r
WHERE s.restaurant_id = r.id
  AND s.restaurant_id = mi.restaurant_id
  AND lower(s.name) = 'menu'
  AND mi.section_id IS NULL;

SELECT 'Migration completed: menu_sections created and existing menus grouped' as status;
