-- Per-terminal ride fares
-- Each terminal (TODA) sets the fare its own rides charge, instead of the
-- single admin-wide rate in admin_settings ('rates'). The global rate is only
-- used as a fallback for terminals that never set their own fare.
-- Execute this SQL in your Supabase project's SQL Editor.

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS base_fare DOUBLE PRECISION DEFAULT 20;

ALTER TABLE terminals
  ADD COLUMN IF NOT EXISTS per_km DOUBLE PRECISION DEFAULT 10;

-- Backfill any existing rows so every terminal starts with a fare.
UPDATE terminals SET base_fare = 20 WHERE base_fare IS NULL;
UPDATE terminals SET per_km = 10 WHERE per_km IS NULL;

SELECT 'Migration completed: terminal ride fares (base_fare, per_km) added' as status;
