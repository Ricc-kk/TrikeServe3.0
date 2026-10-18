-- Per-user chat deletion, chat reports, and image attachments.
-- Run once in the Supabase SQL editor. Conversation deletion is a soft hide on
-- the deleting participant's side, so the other participant keeps the thread.

ALTER TABLE chat_conversations
  ADD COLUMN IF NOT EXISTS deleted_by_a_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by_b_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS chat_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  details TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE chat_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public can submit chat reports" ON chat_reports;
CREATE POLICY "Public can submit chat reports" ON chat_reports
  FOR INSERT WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat_attachments',
  'chat_attachments',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

DROP POLICY IF EXISTS "Public can read chat attachments" ON storage.objects;
CREATE POLICY "Public can read chat attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat_attachments');

DROP POLICY IF EXISTS "Chat participants can upload attachments" ON storage.objects;
CREATE POLICY "Chat participants can upload attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat_attachments');
