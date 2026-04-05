# Database Migration - Add Restaurant Image to Orders

## Status: REQUIRED
This migration must be applied for the order corruption fix to work properly.

## Migration Script
```sql
-- Add restaurant_image and restaurant_name columns to orders table
-- These columns store the restaurant info at the time of order creation
-- This prevents data loss on page reload by making Supabase the single source of truth

ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_name VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS restaurant_image VARCHAR(500);

-- Verify the columns were added
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'orders';
```

## How to Apply

### Option 1: Supabase Dashboard
1. Open your Supabase project
2. Go to **SQL Editor**
3. Click **New Query**
4. Paste the migration script above
5. Click **Run**
6. Verify success (no errors)

### Option 2: Supabase CLI
```bash
# From your project directory
supabase db push
```

## Verification
After running the migration, verify the columns exist:

```sql
-- Check that columns were created
SELECT 
  column_name, 
  data_type, 
  is_nullable 
FROM information_schema.columns 
WHERE table_name = 'orders' 
  AND column_name IN ('restaurant_name', 'restaurant_image')
ORDER BY ordinal_position;
```

Expected output:
| column_name | data_type | is_nullable |
|---|---|---|
| restaurant_name | character varying | YES |
| restaurant_image | character varying | YES |

## What These Columns Do
- **restaurant_name**: Stores the restaurant name at time of order (from the checkout page)
- **restaurant_image**: Stores the restaurant image URL at time of order

This ensures that when customers reload the Activity page, they see the complete order information without relying on localStorage or React context state.

## Backward Compatibility
- Existing orders without these fields will have NULL values
- The Activity component gracefully handles NULL values with default values
- No data loss for existing orders

## Testing After Migration
1. Create a new order
2. Check the orders table in Supabase to verify `restaurant_name` and `restaurant_image` are populated
3. Go to Activity page
4. Reload the page
5. Verify order displays correctly

## Troubleshooting

### "Column already exists" error
This is fine - the migration uses `IF NOT EXISTS` to prevent errors if columns already exist.

### Columns not showing in Activity after migration
1. Verify the columns were created in Supabase (use the verification query above)
2. Create a NEW order (old orders won't have the fields)
3. Check that Cart.tsx is saving the `restaurant_image` field
4. Reload the Activity page

### Restaurant image shows as blank
1. Make sure the migration was applied
2. Verify new orders are being created with `restaurant_image` in the INSERT statement (check Cart.tsx line 227)
3. The restaurant image is passed when creating the order in the Cart component

