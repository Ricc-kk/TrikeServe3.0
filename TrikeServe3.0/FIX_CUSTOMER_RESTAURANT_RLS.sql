-- Allow signed-in customers to read restaurant listings.
-- Run this in the Supabase SQL Editor for an existing database.

ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE public.restaurants TO authenticated;

DROP POLICY IF EXISTS "Customers can view restaurants" ON public.restaurants;
CREATE POLICY "Customers can view restaurants" ON public.restaurants
  FOR SELECT TO authenticated
  USING (true);
