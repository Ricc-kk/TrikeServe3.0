-- Preserve each account's signup role while `users.role` switches between apps.
-- Execute this migration in your Supabase project's SQL Editor.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS original_role VARCHAR(50);

-- Recover known role switches for existing accounts using their saved profile
-- details. `to_jsonb` keeps this safe on databases without is_terminal_admin.
UPDATE public.users AS user_row
SET original_role = CASE
  WHEN COALESCE((to_jsonb(user_row)->>'is_terminal_admin')::BOOLEAN, FALSE)
    OR user_row.admin_type = 'rider'
    OR NULLIF(BTRIM(user_row.toda_plate), '') IS NOT NULL
    OR NULLIF(BTRIM(user_row.license_number), '') IS NOT NULL
    THEN 'rider'
  WHEN NULLIF(BTRIM(user_row.business_name), '') IS NOT NULL
    OR NULLIF(BTRIM(user_row.business_address), '') IS NOT NULL
    THEN 'business'
  ELSE user_row.role
END
WHERE user_row.original_role IS NULL;

DO $migration$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_original_role_check'
      AND conrelid = 'public.users'::regclass
  ) THEN
    ALTER TABLE public.users
      ADD CONSTRAINT users_original_role_check
      CHECK (original_role IN ('customer', 'rider', 'business', 'admin'));
  END IF;
END;
$migration$;

COMMENT ON COLUMN public.users.original_role IS
  'The account role before switching apps; users.role is the current active app role.';

SELECT 'Migration completed: users.original_role added and backfilled' AS status;
