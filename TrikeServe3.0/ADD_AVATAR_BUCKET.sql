-- Profile photo storage bucket
--
-- Why this file exists
-- --------------------
-- `uploadProfilePhoto` in src/lib/supabase.ts uploaded to a bucket named
-- `avatars`, but no migration ever created it. SUPABASE_SCHEMA.sql creates
-- `user_profiles`, `restaurants` and `menu_items` only. Every profile photo
-- upload therefore failed against a missing bucket, and because the UI showed
-- a generic "Failed to upload photo", the cause was never visible.
--
-- The code now targets `user_profiles`. This script makes sure that bucket
-- exists with the right policies on any project — including one already
-- deployed before this file was added. It is idempotent: safe to re-run.
--
-- Run in the Supabase SQL Editor, then retry the upload from Account or Profile.

INSERT INTO storage.buckets (id, name, public)
VALUES ('user_profiles', 'user_profiles', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Public read: avatars are rendered in <img> tags on other people's screens
-- (favourites, order cards), so the URL must be readable without a session.
DROP POLICY IF EXISTS "Public read access to user profiles" ON storage.objects;
CREATE POLICY "Public read access to user profiles" ON storage.objects
  FOR SELECT USING (bucket_id = 'user_profiles');

-- A user may only write inside their own folder: the first path segment of the
-- object name must be their auth uid. `uploadProfilePhoto` uploads to
-- `${userId}/avatar.<ext>`, so this matches exactly.
DROP POLICY IF EXISTS "Users can upload their own profiles" ON storage.objects;
CREATE POLICY "Users can upload their own profiles" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'user_profiles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Re-uploading a photo overwrites the previous one, so upsert needs UPDATE too.
DROP POLICY IF EXISTS "Users can update their own profiles" ON storage.objects;
CREATE POLICY "Users can update their own profiles" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'user_profiles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'user_profiles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users can delete their own profiles" ON storage.objects;
CREATE POLICY "Users can delete their own profiles" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'user_profiles' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Verify: this should list exactly one row named 'user_profiles'.
SELECT id, name, public FROM storage.buckets WHERE id = 'user_profiles';