# Menu Items Supabase Integration

## Overview
Menu items are now saved to Supabase database while maintaining backward compatibility with localStorage. This allows menu items to persist across devices and provides a unified data source.

## Database Structure

### menu_items table
The table already exists in your Supabase schema with the following structure:
```sql
CREATE TABLE menu_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(100) NOT NULL,
  image_url VARCHAR(500),
  is_available BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

## What Changed

### Code Updates
1. **BusinessMenu.tsx**
   - Added Supabase import
   - Auto-creates/retrieves restaurant record
   - Loads menu items from Supabase (with localStorage fallback)
   - Saves menu items to Supabase when changed
   - Delete operations remove from Supabase

2. **BusinessHome.tsx**
   - Added Supabase import
   - Loads menu items from Supabase for dashboard display
   - Falls back to localStorage if Supabase is unavailable

### Key Features
✅ Menu items stored in Supabase
✅ Automatic restaurant record creation
✅ Real-time sync between local state and Supabase
✅ Backward compatible with localStorage
✅ Fallback to localStorage if Supabase unavailable
✅ Proper error handling

## Data Sync Flow

```
Add/Edit Menu Item
       ↓
Update Local State (menuItems)
       ↓
Save to Supabase (debounced after 1 second)
       ↓
Also Save to localStorage (backup)
       ↓
Data Persisted
```

## Default Behavior

- **First Load**: Items load from Supabase if available, otherwise from localStorage
- **Adding Items**: New items are marked with numeric IDs locally, converted to UUIDs on Supabase
- **Editing Items**: Items update in both Supabase and localStorage
- **Deleting Items**: Items deleted from both sources
- **Fallback**: If Supabase is unavailable, items still save to localStorage

## Testing

1. Execute the SQL migration
2. Add a new menu item in BusinessMenu
3. Refresh the page - item should still appear
4. Check Supabase `menu_items` table - item should be there
5. Log out and log back in - items should persist

## RLS Policies

The SQL migration sets up proper Row Level Security:
- Service role can manage all menu items
- Businesses can manage their own restaurant's menu items
- Customers can view menu items

## Production Notes

- Image URLs are stored as text in the database
- For image storage, consider using Supabase Storage bucket (included in SQL setup)
- Customization groups are stored as JSON in the database (optional enhancement)
- The sync is debounced by 1 second to prevent excessive database writes

