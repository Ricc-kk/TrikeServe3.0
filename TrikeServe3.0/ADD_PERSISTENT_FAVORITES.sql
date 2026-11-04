-- Account-synced restaurant and menu-item favorites.
-- Run this once in the Supabase SQL editor for an existing project.

ALTER TABLE public.favorites
  ADD COLUMN IF NOT EXISTS restaurant_snapshot JSONB;

CREATE TABLE IF NOT EXISTS public.favorite_menu_items (
  customer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  menu_item_id UUID NOT NULL REFERENCES public.menu_items(id) ON DELETE CASCADE,
  item_snapshot JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, menu_item_id)
);

CREATE INDEX IF NOT EXISTS idx_favorite_menu_items_customer
  ON public.favorite_menu_items(customer_id);

-- Keep existing restaurant favorites visible after adding snapshot storage.
UPDATE public.favorites AS favorite
SET restaurant_snapshot = jsonb_build_object(
  'id', restaurant.id,
  'name', restaurant.name,
  'image', COALESCE(restaurant.banner_image, restaurant.logo_image, ''),
  'rating', COALESCE(restaurant.rating, 0),
  'reviews', 0,
  'distance', '',
  'estimatedTime', COALESCE(restaurant.delivery_time, ''),
  'category', 'restaurant'
)
FROM public.restaurants AS restaurant
WHERE favorite.restaurant_id = restaurant.id
  AND favorite.restaurant_snapshot IS NULL;

ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorite_menu_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorites TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.favorite_menu_items TO authenticated;

DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorites;
CREATE POLICY "Users can view own favorites" ON public.favorites
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can add own favorites" ON public.favorites;
CREATE POLICY "Users can add own favorites" ON public.favorites
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own favorites" ON public.favorites;
CREATE POLICY "Users can update own favorites" ON public.favorites
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorites;
CREATE POLICY "Users can delete own favorites" ON public.favorites
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own favorite menu items" ON public.favorite_menu_items;
CREATE POLICY "Users can view own favorite menu items" ON public.favorite_menu_items
  FOR SELECT TO authenticated
  USING (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can add own favorite menu items" ON public.favorite_menu_items;
CREATE POLICY "Users can add own favorite menu items" ON public.favorite_menu_items
  FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own favorite menu items" ON public.favorite_menu_items;
CREATE POLICY "Users can update own favorite menu items" ON public.favorite_menu_items
  FOR UPDATE TO authenticated
  USING (customer_id = auth.uid())
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own favorite menu items" ON public.favorite_menu_items;
CREATE POLICY "Users can delete own favorite menu items" ON public.favorite_menu_items
  FOR DELETE TO authenticated
  USING (customer_id = auth.uid());
