-- Let a driver be made admin of the terminal they are assigned to.
--
-- Terminal admin is no longer a separate account type in the admin app: the
-- Super Admin marks one of their drivers as the admin of a TODA from
-- Terminals -> Assignments, and that driver then finds a "Switch to Admin App"
-- control in their own profile. One account, two apps, no second login.
--
-- Execute this SQL in your Supabase project's SQL Editor.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_terminal_admin BOOLEAN DEFAULT false;

-- Backfill rather than leaving the column null: the app reads this flag on
-- every driver profile load and in the Terminals roster, and `undefined` and
-- `false` must never be two different answers for "not an admin".
UPDATE users SET is_terminal_admin = false WHERE is_terminal_admin IS NULL;

-- A driver who is driving out of a terminal, admin or not.
CREATE INDEX IF NOT EXISTS idx_users_terminal_admin ON users(is_terminal_admin)
  WHERE is_terminal_admin;

-- Print confirmation
SELECT 'Migration completed: users.is_terminal_admin added' as status;
