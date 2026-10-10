-- Add per-item choice options to menu_items
--
-- The customisation screens were written a long time ago and the whole feature was
-- dead on arrival: the shop had no way to attach options to a dish, the save never
-- sent them, and this column was never created. The storefront read a
-- `customization_groups` that could not exist, so every dish arrived with no
-- options.
--
-- The shape is the one `CustomizationModal.tsx` already expects on the customer
-- side, so nothing there had to be invented:
--   [{ id, name, enabled, required, minSelections, maxSelections,
--      options: [{ id, name, price }] }]
--
-- JSONB rather than a second table. Options are always read and written whole,
-- never queried by their contents -- "which dishes have an Iced Tea option" is not
-- a question this app asks -- and a nested table would put a join and a second set
-- of RLS policies in front of every menu load.
--
-- Defaults to an empty array so the column is never null: the storefront does
-- `item.customization_groups || []`, and a JSON null would survive that as null
-- and then fail on .length.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS customization_groups JSONB DEFAULT '[]'::jsonb;

-- A dish with options stored as a JSON string (or as null from an older write)
-- would reach the customer modal and break on .forEach. Normalise on the way in.
UPDATE menu_items
SET customization_groups = '[]'::jsonb
WHERE customization_groups IS NULL
   OR jsonb_typeof(customization_groups) <> 'array';

COMMENT ON COLUMN menu_items.customization_groups IS
  'Choice options for this item, e.g. [{"name":"Choice A","enabled":true,"required":true,"minSelections":1,"maxSelections":1,"options":[{"name":"Iced Tea","price":0},{"name":"Coke","price":0}]}]. Empty array = no options.';