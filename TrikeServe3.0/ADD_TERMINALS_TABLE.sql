-- Add terminals table + rider terminal assignment for Terminal Management
-- Execute this SQL in your Supabase project's SQL Editor

-- Terminals table
CREATE TABLE IF NOT EXISTS terminals (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  boundary VARCHAR(255) NOT NULL,
  center_lat DOUBLE PRECISION DEFAULT 14.7294,
  center_lng DOUBLE PRECISION DEFAULT 120.9349,
  radius_km DOUBLE PRECISION DEFAULT 2.0,
  is_active BOOLEAN DEFAULT true,
  rider_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_terminals_name ON terminals(name);

-- Rider assignment columns on users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS terminal_id TEXT;

ALTER TABLE users
ADD COLUMN IF NOT EXISTS terminal_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_terminal_id ON users(terminal_id);

-- Row Level Security (permissive, matching this project's anon-key custom-auth
-- convention — see the driver_ratings/orders policies in SUPABASE_SCHEMA.sql)
ALTER TABLE terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view terminals" ON terminals
  FOR SELECT USING (true);

CREATE POLICY "Anyone can insert terminals" ON terminals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update terminals" ON terminals
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can delete terminals" ON terminals
  FOR DELETE USING (true);

-- Seed data (only inserted when the table is empty)
INSERT INTO terminals (id, name, boundary, center_lat, center_lng, radius_km, is_active, rider_count)
VALUES
  ('t1', 'Valenzuela Terminal', 'Main Road, Valenzuela City', 14.7294, 120.9349, 2.0, true, 0),
  ('t2', 'Malinta Terminal', 'Malinta, Valenzuela City', 14.7150, 120.9500, 1.5, true, 0),
  ('t3', 'Paso de Blas Terminal', 'Paso de Blas, Valenzuela City', 14.6950, 120.9600, 1.8, false, 0)
ON CONFLICT (id) DO NOTHING;

-- Print confirmation
SELECT 'Migration completed: terminals table created, users.terminal_id/terminal_name added, seeds inserted' as status;
