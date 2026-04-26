-- Add badge column to menu_items table
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS badge VARCHAR(50);

-- Add comment for clarity
COMMENT ON COLUMN menu_items.badge IS 'Badge type: most-ordered, most-liked, signature, or NULL for no badge';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_menu_items_badge ON menu_items(badge);

