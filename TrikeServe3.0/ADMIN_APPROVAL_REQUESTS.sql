-- Admin Approval Requests
-- Rider Admin terminal/driver actions are staged here and only applied once the
-- Super Admin (Business & Customer Admin) approves them.
-- Execute this SQL in your Supabase project's SQL Editor.

CREATE TABLE IF NOT EXISTS admin_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What the Rider Admin is proposing
  request_type VARCHAR(50) NOT NULL CHECK (request_type IN (
    'terminal_create',
    'terminal_update',
    'terminal_delete',
    'driver_assign',
    'driver_unassign'
  )),
  -- Full proposed values. For terminal_* this is the terminal row; for
  -- driver_* this is { driver_id, driver_name, terminal_id, terminal_name }.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Who asked (admin email + name from the admins table)
  requested_by_email VARCHAR(255),
  requested_by_name VARCHAR(255),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  -- Who reviewed it
  reviewed_by_email VARCHAR(255),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON admin_approval_requests(status);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_by ON admin_approval_requests(requested_by_email);
CREATE INDEX IF NOT EXISTS idx_approval_requests_requested_at ON admin_approval_requests(requested_at);

-- Row Level Security (permissive, matching this project's anon-key custom-auth
-- convention — see the admins/terminals policies)
ALTER TABLE admin_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view approval requests" ON admin_approval_requests;
CREATE POLICY "Anyone can view approval requests" ON admin_approval_requests
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can insert approval requests" ON admin_approval_requests;
CREATE POLICY "Anyone can insert approval requests" ON admin_approval_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can update approval requests" ON admin_approval_requests;
CREATE POLICY "Anyone can update approval requests" ON admin_approval_requests
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete approval requests" ON admin_approval_requests;
CREATE POLICY "Anyone can delete approval requests" ON admin_approval_requests
  FOR DELETE USING (true);

-- Print confirmation
SELECT 'Migration completed: admin_approval_requests table created' as status;
