-- Preserve the terminal route selected by the customer on private ride requests.
-- The rider uses this id to follow the same plotted route after pickup.
ALTER TABLE ride_requests
ADD COLUMN IF NOT EXISTS route_id TEXT;

COMMENT ON COLUMN ride_requests.route_id IS
  'ID of the selected route in terminals.routes for this ride request';
