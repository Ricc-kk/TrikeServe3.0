-- Per-shop "open now anyway" override
--
-- A shop with trading hours set cannot currently open outside them. Its hours
-- say closed, the customer-facing badge says closed, and the only way to take a
-- late order is to edit the schedule — which permanently changes what every
-- customer sees for the sake of tonight.
--
--   force_open_until
--                   While this is in the future, the shop trades regardless of
--                   its hours. NULL = no override, which is every shop that has
--                   never used the button.
--
-- A timestamp rather than a boolean, deliberately. A flag only clears when
-- someone remembers to clear it, and "remember to close the shop you opened at
-- 11pm" fails often enough that a shop ends up serving at 3am days later. A
-- deadline is compared against the clock at read time, so it lapses on its own
-- and no scheduled job is needed to expire it.
--
-- Set to midnight local by the app, so an evening override cannot bleed into the
-- next trading day. The owner can end it early from the same button.
--
-- Execute this SQL in your Supabase project's SQL Editor.

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS force_open_until TIMESTAMPTZ;

COMMENT ON COLUMN restaurants.force_open_until IS
  'While in the future, this shop trades regardless of its opening hours. NULL = no override. Set to midnight local by the "Open now anyway" button.';

SELECT 'Migration completed: restaurants.force_open_until added' AS status;