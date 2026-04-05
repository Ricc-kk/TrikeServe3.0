-- Manually insert admin accounts if they don't exist
INSERT INTO admins (email, name, phone, admin_type, password_hash, is_verified, created_at)
VALUES
  ('admin@gmail.com', 'Business & Customer Admin', '09171234567', 'business_customer', 'admin123', true, NOW()),
  ('admin1@gmail.com', 'Rider Admin', '09171234568', 'rider', 'admin123', true, NOW())
ON CONFLICT (email) DO NOTHING;

-- Verify the inserts
SELECT email, name, admin_type, is_verified FROM admins ORDER BY email;

