-- Move the existing default Super Admin identity to the reserved owner email.
-- The password_hash is preserved; this script never sets or prints a password.
-- If both rows already exist, the requested email is promoted and the old
-- default Super Admin is demoted to a Rider Admin.
DO $$
DECLARE
  target_id UUID;
  legacy_id UUID;
BEGIN
  SELECT id INTO target_id
  FROM public.admins
  WHERE lower(email) = 'trikeserveadmin@gmail.com'
  LIMIT 1;

  SELECT id INTO legacy_id
  FROM public.admins
  WHERE lower(email) = 'admin@gmail.com'
    AND admin_type IN ('admin', 'business_customer')
  LIMIT 1;

  IF target_id IS NULL THEN
    IF legacy_id IS NULL THEN
      RAISE EXCEPTION 'No existing Super Admin row found. Create the account with a unique password, then rerun this script.';
    END IF;

    UPDATE public.admins
    SET email = 'trikeserveadmin@gmail.com',
        name = 'Super Admin',
        admin_type = 'admin',
        updated_at = NOW()
    WHERE id = legacy_id;
    RETURN;
  END IF;

  UPDATE public.admins
  SET name = 'Super Admin',
      admin_type = 'admin',
      updated_at = NOW()
  WHERE id = target_id;

  IF legacy_id IS NOT NULL AND legacy_id <> target_id THEN
    UPDATE public.admins
    SET name = 'Driver Admin',
        admin_type = 'rider',
        updated_at = NOW()
    WHERE id = legacy_id;
  END IF;
END;
$$;
