-- Store optional customer ratings for each dish in a delivered order.
-- Run this migration in the Supabase SQL Editor before using item ratings.

CREATE TABLE IF NOT EXISTS public.menu_item_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_index INTEGER NOT NULL CHECK (order_item_index >= 0),
  menu_item_id TEXT NOT NULL,
  restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT menu_item_ratings_order_item_unique UNIQUE (order_id, order_item_index)
);

CREATE INDEX IF NOT EXISTS idx_menu_item_ratings_restaurant_item
  ON public.menu_item_ratings (restaurant_id, menu_item_id);

ALTER TABLE public.menu_item_ratings ENABLE ROW LEVEL SECURITY;

-- The app currently uses its own localStorage sign-in rather than Supabase Auth,
-- so auth.uid() is NULL here. Match the existing ratings tables' anon-key access.
DROP POLICY IF EXISTS "Anyone can read menu item ratings" ON public.menu_item_ratings;
CREATE POLICY "Anyone can read menu item ratings" ON public.menu_item_ratings
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can submit menu item ratings" ON public.menu_item_ratings;
CREATE POLICY "Anyone can submit menu item ratings" ON public.menu_item_ratings
  FOR INSERT WITH CHECK (true);

-- Ratings are permanent once submitted. Dropping the old policy and revoking
-- table privileges also locks databases where an earlier version was applied.
DROP POLICY IF EXISTS "Anyone can update menu item ratings" ON public.menu_item_ratings;
REVOKE UPDATE ON TABLE public.menu_item_ratings FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT ON public.menu_item_ratings TO anon, authenticated;

-- A compact summary avoids loading every individual rating to choose a badge.
CREATE OR REPLACE VIEW public.menu_item_rating_summary AS
SELECT
  restaurant_id,
  menu_item_id,
  AVG(rating) AS average_rating,
  COUNT(*)::INTEGER AS rating_count
FROM public.menu_item_ratings
GROUP BY restaurant_id, menu_item_id;

GRANT SELECT ON public.menu_item_rating_summary TO anon, authenticated;
