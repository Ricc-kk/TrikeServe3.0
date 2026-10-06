-- Let a business propose a change to its own shop profile, and let the Super
-- Admin apply it from Approvals.
--
-- Why this exists
-- ---------------
-- Until now only the Rider Admin could stage anything, and only terminal/driver
-- changes. A business wrote `restaurants` directly the moment it tapped Save:
-- business name, address, delivery time, operating hours, cuisine and the map pin
-- all went live with no review at all, so a shop could rename itself to anything
-- or move its pickup point to a competitor's address.
--
-- The queue table already exists and the Approvals tab already renders it. The
-- blocker was the CHECK constraint on `request_type`: it enumerates five literal
-- values, so Postgres -- not the app -- rejects the insert. That constraint has
-- to be replaced before any business request can be stored.
--
-- Run this in Supabase's SQL Editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- 1. Widen the request_type CHECK
-- ---------------------------------------------------------------------------
-- The constraint was declared inline in ADMIN_APPROVAL_REQUESTS.sql, so Postgres
-- auto-named it. Both that auto-generated name and the name given here are
-- dropped in case an earlier hand-edit renamed it.

ALTER TABLE admin_approval_requests
  DROP CONSTRAINT IF EXISTS admin_approval_requests_request_type_check;

ALTER TABLE admin_approval_requests
  DROP CONSTRAINT IF EXISTS admin_approval_requests_request_type_chk;

ALTER TABLE admin_approval_requests
  DROP CONSTRAINT IF EXISTS admin_approval_requests_request_type;

ALTER TABLE admin_approval_requests
  ADD CONSTRAINT admin_approval_requests_request_type_check
  CHECK (request_type IN (
    'terminal_create',
    'terminal_update',
    'terminal_delete',
    'driver_assign',
    'driver_unassign',
    'business_profile_update'
  ));

-- ---------------------------------------------------------------------------
-- 2. Indexes for the business queue
-- ---------------------------------------------------------------------------

-- "Does this shop already have a change waiting?" is asked on every business
-- screen load, and the existing status index alone cannot answer it.
CREATE INDEX IF NOT EXISTS idx_approval_requests_business_pending
  ON admin_approval_requests (request_type, status)
  WHERE request_type = 'business_profile_update' AND status = 'pending';

-- The Super Admin's pending list is ordered by age; this keeps that from sorting
-- the whole table.
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending_at
  ON admin_approval_requests (requested_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE admin_approval_requests IS
  'Staged platform changes awaiting Super Admin review. Rider Admin terminal/driver proposals and business shop-profile edits. Approving applies the payload; rejecting applies nothing.';

COMMENT ON COLUMN admin_approval_requests.payload IS
  'Full proposed values. For business_profile_update: { restaurant_id, restaurant_name, business_user_id, before: {...}, after: {...} }. before/after let the reviewer see a field-level diff rather than a blob.';

SELECT 'Migration completed: business_profile_update is now a storable approval request type' as status;
