-- Let each terminal choose how many initial kilometres its base fare covers.
-- For example: a base fare of 50 with 1 included kilometre and a rate of 10/km
-- charges 50 for trips up to 1 km, then 10/km only for the remaining distance.
--
-- Share ride and delivery defaults are 1 km. A private ride's NULL value means
-- it inherits the share ride's included distance, like its price and per-km rate.

ALTER TABLE public.terminals
  ADD COLUMN IF NOT EXISTS base_fare_included_km DOUBLE PRECISION NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS private_ride_fee_included_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS delivery_fee_included_km DOUBLE PRECISION NOT NULL DEFAULT 1;

UPDATE public.terminals
SET base_fare_included_km = 1
WHERE base_fare_included_km IS NULL OR base_fare_included_km < 0;

UPDATE public.terminals
SET private_ride_fee_included_km = NULL
WHERE private_ride_fee_included_km < 0;

UPDATE public.terminals
SET delivery_fee_included_km = 1
WHERE delivery_fee_included_km IS NULL OR delivery_fee_included_km < 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'terminals_base_fare_included_km_nonnegative'
  ) THEN
    ALTER TABLE public.terminals
      ADD CONSTRAINT terminals_base_fare_included_km_nonnegative
      CHECK (base_fare_included_km >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'terminals_private_ride_fee_included_km_nonnegative'
  ) THEN
    ALTER TABLE public.terminals
      ADD CONSTRAINT terminals_private_ride_fee_included_km_nonnegative
      CHECK (private_ride_fee_included_km IS NULL OR private_ride_fee_included_km >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'terminals_delivery_fee_included_km_nonnegative'
  ) THEN
    ALTER TABLE public.terminals
      ADD CONSTRAINT terminals_delivery_fee_included_km_nonnegative
      CHECK (delivery_fee_included_km >= 0);
  END IF;
END $$;

COMMENT ON COLUMN public.terminals.base_fare_included_km IS
  'Share ride base fare covers this many kilometres before per_km is charged.';
COMMENT ON COLUMN public.terminals.private_ride_fee_included_km IS
  'Private ride base fare included kilometres. NULL inherits base_fare_included_km.';
COMMENT ON COLUMN public.terminals.delivery_fee_included_km IS
  'Delivery base fee covers this many kilometres before delivery_fee_per_km is charged.';
