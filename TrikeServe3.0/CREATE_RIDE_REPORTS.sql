-- Customer ride reports.
--
-- Customers can report a completed ride (rides only, not deliveries) from their
-- Activity page. Reports are reviewed by the Super Admin on /admin/reports.
--
-- Run this once in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS ride_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ride_id UUID,
  reporter_id UUID,
  reporter_name TEXT,
  reporter_email TEXT,
  driver_id UUID,
  driver_name TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  ride_route TEXT,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | reviewing | resolved | dismissed
  admin_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ride_reports_status ON ride_reports(status);
CREATE INDEX IF NOT EXISTS idx_ride_reports_reporter ON ride_reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_ride_reports_created_at ON ride_reports(created_at);

ALTER TABLE ride_reports ENABLE ROW LEVEL SECURITY;

-- Custom localStorage auth means auth.uid() is NULL, matching the rest of the
-- project's permissive policies. The app enforces who can do what.
DROP POLICY IF EXISTS "Anyone can insert ride reports" ON ride_reports;
DROP POLICY IF EXISTS "Anyone can view ride reports" ON ride_reports;
DROP POLICY IF EXISTS "Anyone can update ride reports" ON ride_reports;
DROP POLICY IF EXISTS "Anyone can delete ride reports" ON ride_reports;

CREATE POLICY "Anyone can insert ride reports" ON ride_reports
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can view ride reports" ON ride_reports
  FOR SELECT USING (true);

CREATE POLICY "Anyone can update ride reports" ON ride_reports
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete ride reports" ON ride_reports
  FOR DELETE USING (true);

SELECT 'Migration completed: ride_reports table ready' AS status;
