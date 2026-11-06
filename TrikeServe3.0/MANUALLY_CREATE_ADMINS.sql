-- Manually insert admin accounts if they don't exist.
-- Replace the Super Admin placeholder with a unique password before running.
INSERT INTO admins (email, name, phone, admin_type, password_hash, is_verified, created_at)
VALUES
  ('trikeserveadmin@gmail.com', 'Super Admin', '09171234567', 'business_customer', 'REPLACE_WITH_A_UNIQUE_PASSWORD', true, NOW()),
  ('admin1@gmail.com', 'Rider Admin', '09171234568', 'rider', 'admin123', true, NOW())
ON CONFLICT (email) DO NOTHING;

-- Verify the inserts
SELECT email, name, admin_type, is_verified FROM admins ORDER BY email;

