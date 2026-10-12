-- Per-terminal private ride pricing
--
-- A private ride books the whole vehicle, so it is priced separately from a
-- shared seat rather than as the shared fare plus a flat extra. A terminal can
-- now charge a private ride whatever it wants, on the same base + per-km shape
-- every other fare in the app uses:
--
--   private_ride_fee
--                   The flat part of a private ride's fare, exactly as
--                   terminals.base_fare is for a shared one.
--
--   private_ride_fee_per_km
--                   The distance part of it, mirroring terminals.per_km. So a
--                   long private trip still costs more than a short one, which
--                   a flat fee on its own cannot do.
--
-- Both are NULLable with no DEFAULT, and NULL means "use the shared ride rate":
--
--   private_ride_fee        NULL -> terminals.base_fare
--   private_ride_fee_per_km NULL -> terminals.per_km
--
-- That fallback is the whole reason for leaving them empty. An existing terminal
-- prices a private ride today at exactly base + per-km, because there was no
-- separate private price to read. Backfilling these columns with the platform
-- defaults would instead pin every terminal to one hardcoded number and stop it
-- following its own share rate; leaving them NULL keeps every unedited terminal
-- charging precisely what it charged before, with no migration-time repricing.
--
-- Execute this SQL in your Supabase project's SQL Editor.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS private_ride_fee DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS private_ride_fee_per_km DOUBLE PRECISION;

COMMENT ON COLUMN terminals.private_ride_fee IS
  'Flat part of the private (whole vehicle) ride fare, in pesos. NULL = use this terminal''s base_fare.';

COMMENT ON COLUMN terminals.private_ride_fee_per_km IS
  'Per-kilometre part of the private (whole vehicle) ride fare, in pesos. NULL = use this terminal''s per_km.';

-- A negative fare or rate is never a price. Cleared back to "not set" so the
-- fallback applies, rather than pricing rides below what they cost.
UPDATE terminals
SET private_ride_fee = NULL
WHERE private_ride_fee IS NOT NULL AND private_ride_fee < 0;

UPDATE terminals
SET private_ride_fee_per_km = NULL
WHERE private_ride_fee_per_km IS NOT NULL AND private_ride_fee_per_km < 0;

SELECT 'Migration completed: terminals.private_ride_fee and private_ride_fee_per_km added' AS status;