# Add restaurant_name Column to Orders Table

Run this SQL in Supabase to add the restaurant_name column:

```sql
-- Add restaurant_name column to orders table
ALTER TABLE orders ADD COLUMN restaurant_name VARCHAR(255);

-- Update existing orders with restaurant_email as name (fallback)
UPDATE orders SET restaurant_name = restaurant_email WHERE restaurant_name IS NULL;

SELECT 'restaurant_name column added successfully' as status;
```

This will:
1. Add the `restaurant_name` column
2. Set existing orders to use `restaurant_email` as fallback
3. Allow future orders to store the actual restaurant name

