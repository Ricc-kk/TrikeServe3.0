-- Saved delivery addresses and restaurant search history.
--
-- Why this exists
-- ---------------
-- There was nowhere to store a customer's delivery addresses and nothing that
-- recorded what people searched for, so "saved places", "recent" and "popular
-- searches" could not exist. These are per-user rows so they follow the account
-- across devices rather than living in one phone's localStorage.

-- Saved / recent delivery addresses -------------------------------------------
CREATE TABLE IF NOT EXISTS user_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label VARCHAR(80) NOT NULL,
  address VARCHAR(255) NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user ON user_addresses(user_id);

ALTER TABLE user_addresses ENABLE ROW LEVEL SECURITY;

-- Owner-only: a customer may read, create, change and remove exactly their own
-- addresses, and nobody else's. This mirrors how `favorites` is locked down.
DROP POLICY IF EXISTS "Users can view own addresses" ON user_addresses;
CREATE POLICY "Users can view own addresses" ON user_addresses
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can add own addresses" ON user_addresses;
CREATE POLICY "Users can add own addresses" ON user_addresses
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own addresses" ON user_addresses;
CREATE POLICY "Users can update own addresses" ON user_addresses
  FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own addresses" ON user_addresses;
CREATE POLICY "Users can delete own addresses" ON user_addresses
  FOR DELETE USING (user_id = auth.uid());

-- Search terms people actually typed ------------------------------------------
-- One row per committed search, so "popular searches" is a real aggregate
-- across all customers rather than a guess. Term is stored lowercased and
-- trimmed by the client helper.
CREATE TABLE IF NOT EXISTS restaurant_searches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  term VARCHAR(120) NOT NULL,
  restaurant_id UUID REFERENCES restaurants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_restaurant_searches_term ON restaurant_searches(term);
CREATE INDEX IF NOT EXISTS idx_restaurant_searches_created ON restaurant_searches(created_at DESC);

ALTER TABLE restaurant_searches ENABLE ROW LEVEL SECURITY;

-- Any signed-in customer may record a search, and any signed-in customer may
-- read the aggregate. Rows are never updated or deleted -- an append-only log
-- keeps the popularity ranking honest.
DROP POLICY IF EXISTS "Anyone signed in can log a search" ON restaurant_searches;
CREATE POLICY "Anyone signed in can log a search" ON restaurant_searches
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Anyone signed in can read searches" ON restaurant_searches;
CREATE POLICY "Anyone signed in can read searches" ON restaurant_searches
  FOR SELECT USING (auth.uid() IS NOT NULL);