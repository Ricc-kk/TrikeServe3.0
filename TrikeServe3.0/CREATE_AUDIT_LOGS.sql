-- Audit trail for the Super Admin
-- Records who did what and when for platform-changing actions (approvals, user
-- verification, terminal changes, rate changes, rider-admin assignments).
-- Execute this SQL in your Supabase project's SQL Editor.

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_email VARCHAR(255),
  actor_name VARCHAR(255),
  -- Role of whoever performed the action: admin | rider | customer | business.
  actor_role VARCHAR(50),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id VARCHAR(255),
  summary TEXT,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add the column for installs created before actor roles were tracked. This
-- runs before the index so the index below can always reference the column.
ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_role ON audit_logs(actor_role);

-- Row Level Security (permissive, matching this project's anon-key custom-auth
-- convention — see the terminals policies in ADD_TERMINALS_TABLE.sql).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies are not idempotent in older Postgres, so guard them with a DO block
-- (re-running the script then doesn't fail with "policy already exists").
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Anyone can view audit logs') THEN
    CREATE POLICY "Anyone can view audit logs" ON audit_logs FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_logs' AND policyname = 'Anyone can insert audit logs') THEN
    CREATE POLICY "Anyone can insert audit logs" ON audit_logs FOR INSERT WITH CHECK (true);
  END IF;
END $$;

SELECT 'Migration completed: audit_logs table created' as status;
