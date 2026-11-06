-- Remove the retired demo/legacy admin accounts from the custom admins table.
-- This does not delete regular users, ride history, or Supabase Auth accounts.
DELETE FROM public.admins
WHERE lower(email) IN ('admin@gmail.com', 'admin1@gmail.com')
RETURNING email, admin_type;
