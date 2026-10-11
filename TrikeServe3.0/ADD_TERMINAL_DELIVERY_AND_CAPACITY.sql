-- Per-terminal delivery fee and passenger capacity
--
-- Two numbers the admin needed to set per terminal, and could not:
--
--   delivery_fee    This terminal's food delivery fee, so a far terminal is not
--                   forced to charge the same as one next door. NULL means "use
--                   the platform default", so existing terminals keep behaving
--                   exactly as they do now rather than silently becoming 0.
--
--   delivery_fee_per_km
--                   The distance part of that fee, mirroring how the ride fare is
--                   a base plus a per-km rate. A terminal that has set neither
--                   keeps charging the flat platform default.
--
--   max_passengers  How many riders a vehicle from this terminal may carry on a
--                   shared ride. Defaults to 4, which is the most a tricycle here
--                   takes in practice. Private rides book the whole vehicle and
--                   are not capped by this.
--
-- All three are deliberately nullable-with-default rather than NOT NULL, so a
-- terminal that predates this migration is not invalid the moment it is added to.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS delivery_fee DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_fee_per_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS max_passengers INTEGER DEFAULT 4;

COMMENT ON COLUMN terminals.delivery_fee IS
  'This terminal''s food delivery fee base, in pesos. NULL = use the platform default from admin_settings.rates.';

COMMENT ON COLUMN terminals.delivery_fee_per_km IS
  'This terminal''s food delivery fee per kilometre, in pesos. NULL or 0 = the delivery fee is flat.';

COMMENT ON COLUMN terminals.max_passengers IS
  'Maximum riders for a shared ride from this terminal. Defaults to 4. Does not apply to private rides, which book the whole vehicle.';

-- Existing terminals have no value here. Give them the default so every terminal
-- carries a real seat count rather than "whatever it happens to be", which is what
-- makes the customer seat list a fixed set instead of arbitrary.
--
-- A stored value below 1 is cleared rather than clamped upward: it is a data-entry
-- accident, and 4 is the default the platform already decided on.
UPDATE terminals
SET max_passengers = 4
WHERE max_passengers IS NULL OR max_passengers < 1;

-- Same for money: a negative fare or rate is never a price.
UPDATE terminals
SET delivery_fee = NULL
WHERE delivery_fee IS NOT NULL AND delivery_fee < 0;

UPDATE terminals
SET delivery_fee_per_km = NULL
WHERE delivery_fee_per_km IS NOT NULL AND delivery_fee_per_km < 0;

SELECT 'Migration completed: terminals.delivery_fee, delivery_fee_per_km and max_passengers added' AS status;