-- Cancellation / decline reasons.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- Customers now give a reason when they cancel a ride or an order, businesses
-- give one when they decline an order, and riders give one when they decline a
-- request. The reason is stored so the other party can see it.

-- ---------------------------------------------------------------------------
-- orders: customer cancellation ("cancelled_by" = 'customer') and
-- business decline ("cancelled_by" = 'business').
-- ---------------------------------------------------------------------------
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20);

-- ---------------------------------------------------------------------------
-- ride_requests: customer cancellation plus per-rider declines.
-- ---------------------------------------------------------------------------
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS cancel_reason TEXT;
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS cancelled_by VARCHAR(20);

-- Riders who declined this request, as JSON:
--   [{"driver_id":"<uuid>","reason":"Too far","at":"2026-01-01T00:00:00Z"}]
-- A declined request is hidden from that rider only — it stays available to
-- every other rider, and the customer is unaffected.
ALTER TABLE ride_requests ADD COLUMN IF NOT EXISTS declined_by JSONB DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- shared_ride_lobbies: per-rider declines for shared rides.
-- ---------------------------------------------------------------------------
ALTER TABLE shared_ride_lobbies ADD COLUMN IF NOT EXISTS declined_by JSONB DEFAULT '[]'::jsonb;

-- Print confirmation
SELECT 'Migration completed: cancellation/decline reason columns added' as status;
