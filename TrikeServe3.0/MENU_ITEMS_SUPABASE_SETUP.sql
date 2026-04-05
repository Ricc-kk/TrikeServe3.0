-- TrikeServe3.0 - Menu Items Supabase Integration
-- Enable RLS policies and create proper constraints for menu_items table
-- The menu_items table already exists, this adds proper security and features

-- First, ensure menu_items table exists with all necessary columns
CREATE TABLE IF NOT EXISTS menu_items (
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

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category);

-- Enable Row Level Security (RLS)
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Service role can manage menu items" ON menu_items;
DROP POLICY IF EXISTS "Businesses can view and manage their menu items" ON menu_items;
DROP POLICY IF EXISTS "Customers can view menu items" ON menu_items;

-- RLS Policies for menu_items
-- Service role (backend) can do anything
CREATE POLICY "Service role can manage menu items" ON menu_items
  FOR ALL USING (auth.role() = 'service_role');

-- Businesses can manage their own menu items (through restaurant_id)
CREATE POLICY "Businesses can view and manage their menu items" ON menu_items
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM restaurants
      WHERE restaurants.id = restaurant_id
      AND restaurants.business_user_id = auth.uid()
    )
  );

-- Customers can view menu items (only available ones ideally, but we keep it simple)
CREATE POLICY "Customers can view menu items" ON menu_items
  FOR SELECT USING (true);

-- Optional: Create a storage bucket for menu item images if it doesn't exist
INSERT INTO storage.buckets (id, name, public) VALUES
  ('menu_items', 'menu_items', true)
ON CONFLICT (id) DO NOTHING;

-- Allow businesses to upload menu item images
DROP POLICY IF EXISTS "Businesses can upload menu item images" ON storage.objects;
CREATE POLICY "Businesses can upload menu item images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'menu_items');

-- Allow public read access to menu item images
DROP POLICY IF EXISTS "Public read access to menu items" ON storage.objects;
CREATE POLICY "Public read access to menu items" ON storage.objects
  FOR SELECT USING (bucket_id = 'menu_items');

