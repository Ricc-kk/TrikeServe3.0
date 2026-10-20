-- Restaurant package photo shown to riders before pickup.
-- Idempotent; run in the Supabase SQL Editor for an existing database.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS restaurant_package_photo_url TEXT;

SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_name = 'orders'
   AND column_name = 'restaurant_package_photo_url';
