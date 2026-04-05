-- TrikeServe3.0 - Admin Table Migration
-- Create a separate table for admin accounts
-- Execute this in your Supabase SQL Editor

-- Admins Table
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  admin_type VARCHAR(50) NOT NULL CHECK (admin_type IN ('business_customer', 'rider')),
  password_hash VARCHAR(255) NOT NULL,
  is_verified BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for faster lookups
CREATE INDEX idx_admins_email ON admins(email);
CREATE INDEX idx_admins_admin_type ON admins(admin_type);

-- Enable Row Level Security (RLS)
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

-- RLS Policies for admins
-- Allow service role for backend operations
CREATE POLICY "Service role can manage admins" ON admins
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Admins can read their own data" ON admins
  FOR SELECT USING (auth.role() = 'service_role');

CREATE POLICY "Admins can update their own data" ON admins
  FOR UPDATE USING (auth.role() = 'service_role');


