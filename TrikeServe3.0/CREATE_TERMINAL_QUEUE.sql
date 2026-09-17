-- Terminal Queue — per-terminal FIFO queue that decides which driver may accept
-- private / share rides.
-- Execute this SQL in your Supabase project's SQL Editor.
--
-- How it works:
--   * One row per driver per terminal (unique constraint), created when the
--     driver taps "Join Queue".
--   * Queue order is `joined_at ASC` (oldest first). Position 1 = "first".
--   * Only the first driver in a terminal's queue may accept private and share
--     rides. Delivery is not gated.
--   * Accepting a ride or leaving the queue deletes the row, so a driver who
--     comes back re-joins at the back of the queue.
--
-- driver_id / terminal_id are TEXT to match `terminals.id` (TEXT) and to avoid
-- UUID-vs-TEXT cast mismatches with `users.id` in RLS comparisons.

CREATE TABLE IF NOT EXISTS terminal_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  terminal_id TEXT NOT NULL,
  driver_id TEXT NOT NULL,
  driver_name VARCHAR(255),
  driver_plate VARCHAR(64),
  status VARCHAR(32) NOT NULL DEFAULT 'waiting',
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT terminal_queue_terminal_driver_key UNIQUE (terminal_id, driver_id)
);

-- Queue lookups are always "all waiting rows for one terminal, oldest first"
CREATE INDEX IF NOT EXISTS idx_terminal_queue_terminal_joined
  ON terminal_queue(terminal_id, joined_at);

CREATE INDEX IF NOT EXISTS idx_terminal_queue_driver
  ON terminal_queue(driver_id);

-- Row Level Security (permissive, matching this project's anon-key custom-auth
-- convention — see the terminals table in ADD_TERMINALS_TABLE.sql)
ALTER TABLE terminal_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view terminal queue" ON terminal_queue
  FOR SELECT USING (true);

CREATE POLICY "Anyone can join terminal queue" ON terminal_queue
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update terminal queue" ON terminal_queue
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "Anyone can leave terminal queue" ON terminal_queue
  FOR DELETE USING (true);

-- Optional: enable realtime streaming for instant queue updates. The app also
-- polls every few seconds, so this is not strictly required. Enable the table
-- under Database → Replication in the Supabase dashboard if this statement is
-- skipped.
ALTER PUBLICATION supabase_realtime ADD TABLE terminal_queue;

SELECT 'Migration completed: terminal_queue table created' as status;
