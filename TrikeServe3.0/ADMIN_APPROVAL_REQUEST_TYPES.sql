-- Let drivers propose a change to their own TODA plate number, and let the Super
-- Admin apply it from Approvals.
--
-- Why this exists
-- ---------------
-- A plate number is the vehicle's legal identity: fares, violations and reports
-- all attach to it. Editing `users.toda_plate` directly let a driver retype the
-- plate the moment they tapped Save, with no review, so the wrong tricycle could
-- be left carrying someone else's record.
--
-- The driver now stages a request instead, and the row keeps its current plate
-- until a Super Admin approves it. `applyApprovalRequest` in src/lib/supabase.ts
-- writes the new plate on approve.
--
-- The queue table already exists and the Approvals tab already renders it. The
-- blocker is the CHECK constraint on `request_type`: it enumerates a fixed list
-- of literals, so Postgres -- not the app -- rejects the insert.
--
-- This supersedes ADMIN_BUSINESS_APPROVALS.sql, which did the same widening for
-- `business_profile_update`. Run this one instead; it covers both types.
--
-- Run in Supabase's SQL Editor. Idempotent.

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
    'business_profile_update',
    'rider_plate_update'
  ));

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

-- "Does this driver already have a plate change waiting?" is asked on every
-- driver profile load, and the status index alone cannot answer it.
CREATE INDEX IF NOT EXISTS idx_approval_requests_rider_plate_pending
  ON admin_approval_requests (request_type, status)
  WHERE request_type = 'rider_plate_update' AND status = 'pending';

-- Same question for a shop, kept from ADMIN_BUSINESS_APPROVALS.sql.
CREATE INDEX IF NOT EXISTS idx_approval_requests_business_pending
  ON admin_approval_requests (request_type, status)
  WHERE request_type = 'business_profile_update' AND status = 'pending';

-- The Super Admin's pending list is ordered by age; this keeps that from sorting
-- the whole table.
CREATE INDEX IF NOT EXISTS idx_approval_requests_pending_at
  ON admin_approval_requests (requested_at DESC)
  WHERE status = 'pending';

COMMENT ON TABLE admin_approval_requests IS
  'Staged platform changes awaiting Super Admin review. Rider Admin terminal/driver proposals, driver TODA plate changes, and business shop-profile edits. Approving applies the payload; rejecting applies nothing.';

COMMENT ON COLUMN admin_approval_requests.payload IS
  'Full proposed values. For business_profile_update: { restaurant_id, business_user_id, before: {...}, after: {...} }. For rider_plate_update: { driver_id, driver_name, previous_plate, new_plate }. The before/after (or previous/new) pair lets the reviewer see a field-level diff rather than a blob.';

SELECT 'Migration completed: business_profile_update and rider_plate_update are now storable approval request types' as status;
