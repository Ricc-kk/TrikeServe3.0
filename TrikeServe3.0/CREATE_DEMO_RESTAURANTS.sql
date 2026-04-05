-- Insert demo restaurants for testing
-- Run this in Supabase SQL Editor to populate restaurants

INSERT INTO restaurants (name, business_user_id, address, phone, rating, is_open, created_at, updated_at)
VALUES
  ('Kuya J Eatery', 'demo-business-1', 'Tagalag, Valenzuela City', '09171234567', 4.5, true, NOW(), NOW()),
  ('Mang Tomas BBQ', 'demo-business-2', 'Barangay Tagalag, Valenzuela', '09171234568', 4.7, true, NOW(), NOW()),
  ('Tagalag Carinderia', 'demo-business-3', 'Tagalag Center, Valenzuela', '09171234569', 4.3, true, NOW(), NOW()),
  ('Jollibee Tagalag', 'demo-business-4', 'Tagalag, Valenzuela', '09171234570', 4.6, true, NOW(), NOW()),
  ('Chow King Delivery', 'demo-business-5', 'Barangay Tagalag', '09171234571', 4.4, true, NOW(), NOW())
ON CONFLICT (business_user_id) DO NOTHING;

-- Verify the restaurants were created
SELECT id, name, address, is_open FROM restaurants ORDER BY name;

