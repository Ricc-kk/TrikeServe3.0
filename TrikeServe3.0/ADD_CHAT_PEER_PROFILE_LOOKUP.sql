-- Resolve chat participant profiles without granting broad read access to users.
-- The function only returns the signed-in user's own profile and profiles of
-- users who share a conversation with them.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Older installs used profile_photo_url. Keep those existing photos when the
-- current avatar_url column is introduced.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'profile_photo_url'
  ) THEN
    EXECUTE $sql$
      UPDATE public.users
      SET avatar_url = profile_photo_url
      WHERE NULLIF(avatar_url, '') IS NULL
        AND NULLIF(profile_photo_url, '') IS NOT NULL
    $sql$;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.get_chat_peer_profiles(p_user_ids UUID[])
RETURNS TABLE (id UUID, name TEXT, avatar_url TEXT, role TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT u.id, u.name::TEXT, u.avatar_url::TEXT, u.role::TEXT
  FROM public.users AS u
  WHERE u.id = ANY(COALESCE(p_user_ids, ARRAY[]::UUID[]))
    AND auth.uid() IS NOT NULL
    AND (
      u.id = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM public.chat_conversations AS c
        WHERE (c.participant_a_id = auth.uid() AND c.participant_b_id = u.id)
           OR (c.participant_b_id = auth.uid() AND c.participant_a_id = u.id)
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.get_chat_peer_profiles(UUID[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_chat_peer_profiles(UUID[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_chat_peer_profiles(UUID[]) TO authenticated;
