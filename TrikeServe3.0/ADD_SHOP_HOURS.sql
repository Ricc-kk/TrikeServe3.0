-- Shop opening hours
--
-- Why this file exists
-- --------------------
-- `restaurants.operating_hours` is a single free-text string a shop owner types,
-- e.g. "8:00 AM - 10:00 PM". Nothing reads it. It cannot be parsed reliably (a
-- shop writes it as "8am-10pm", "08:00 - 22:00", "Open 8am daily"), it has no
-- days, and it cannot drive anything.
--
-- A shop owner needs to say "I am open 8AM to 10PM, Monday to Saturday" and have
-- the shop actually show closed outside that — a customer opening the storefront
-- at 11pm should not be able to order from a shop that has been shut for hours.
--
-- Three columns, all nullable so this is safe to add before any shop has filled
-- them in: a NULL `open_time` means "no schedule configured", and the shop falls
-- back to its manual open/closed switch exactly as it behaves today.
--
-- `open_days` is 0-6 for Sunday..Saturday, matching `Date.prototype.getDay()`, so
-- no conversion table is needed at read time.
--
-- Saved straight to the row, not staged for Super Admin review: a shop's trading
-- hours are its own business, affect nobody else's listing, and a customer who
-- cannot tell whether the shop is open is the whole problem being fixed.
--
-- Idempotent: safe to re-run.

-- "HH:MM" in 24-hour local time. A pair, not a string, because the app has to
-- compare them against the current time to decide whether the shop is open.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS open_time TEXT;
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS close_time TEXT;

-- Which days the shop trades. NULL / empty = open every day, which is what a
-- shop that has never touched the editor gets.
ALTER TABLE restaurants ADD COLUMN IF NOT EXISTS open_days TEXT[] DEFAULT '{}';

-- Guard the shape rather than trusting the client: a shop row with an open time
-- but no close time would silently read as "always open", and one with both
-- missing is just a shop that has not set hours up yet.
ALTER TABLE restaurants DROP CONSTRAINT IF EXISTS restaurants_hours_shape;
ALTER TABLE restaurants ADD CONSTRAINT restaurants_hours_shape CHECK (
  (open_time IS NULL AND close_time IS NULL)
  OR
  (open_time ~ '^[0-2][0-9]:[0-5][0-9]$'
     AND close_time ~ '^[0-2][0-9]:[0-5][0-9]$')
);

COMMENT ON COLUMN restaurants.open_time IS
  'Local opening time as HH:MM (24-hour). NULL means no schedule is configured.';
COMMENT ON COLUMN restaurants.close_time IS
  'Local closing time as HH:MM (24-hour). Earlier than open_time means the shop trades past midnight.';
COMMENT ON COLUMN restaurants.open_days IS
  'Days the shop trades, 0=Sunday..6=Saturday. Empty means every day.';

-- Verify: should list the three new columns.
SELECT column_name, data_type, column_default
  FROM information_schema.columns
 WHERE table_name = 'restaurants'
   AND column_name IN ('open_time', 'close_time', 'open_days')
 ORDER BY column_name;