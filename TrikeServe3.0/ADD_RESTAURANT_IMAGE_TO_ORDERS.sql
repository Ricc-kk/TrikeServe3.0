-- Add restaurant_image column to orders table to fix data corruption on reload
-- This ensures orders can be displayed with full information without relying on localStorage

ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_image VARCHAR(500);

-- Comment: These columns store the restaurant name and image at the time the order was created
-- This prevents data loss when the page is reloaded, as the Activity component can now
-- retrieve all necessary information directly from the Supabase orders table

