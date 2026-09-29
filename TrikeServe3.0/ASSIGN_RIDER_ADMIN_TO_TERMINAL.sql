-- Assign a Rider Admin to a single terminal
-- The Super Admin picks the terminal; that Rider Admin can then only edit this
-- terminal and manage its driver assignments.
-- Execute this SQL in your Supabase project's SQL Editor.

ALTER TABLE admins ADD COLUMN IF NOT EXISTS terminal_id TEXT;

ALTER TABLE admins ADD COLUMN IF NOT EXISTS terminal_name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_admins_terminal_id ON admins(terminal_id);

-- Print confirmation
SELECT 'Migration completed: admins.terminal_id/terminal_name added' as status;
