-- Ensure the separately provisioned Super Admin row has the expected type.
-- This script never sets or prints a password.
DO $$
DECLARE
  target_exists BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE lower(email) = 'trikeserveadmin@gmail.com'
  ) INTO target_exists;

  IF NOT target_exists THEN
    RAISE EXCEPTION 'No Super Admin row found. Provision the Super Admin account, then rerun this script.';
  END IF;

  UPDATE public.admins
  SET name = 'Super Admin',
      admin_type = 'admin',
      updated_at = NOW()
  WHERE lower(email) = 'trikeserveadmin@gmail.com';
END;
$$;
