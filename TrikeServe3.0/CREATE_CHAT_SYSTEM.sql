    -- Chat system for Customers, Business Owners, and Drivers
    -- Creates thread-based conversations and real-time messages

    -- Conversations table
    CREATE TABLE IF NOT EXISTS chat_conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      thread_key TEXT NOT NULL UNIQUE,
      thread_type TEXT NOT NULL DEFAULT 'direct', -- direct, ride, order, support
      context_type TEXT, -- ride, order, support, general
      context_id TEXT, -- ride ID / order ID / custom context ID
      participant_a_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      participant_b_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      participant_a_role TEXT NOT NULL,
      participant_b_role TEXT NOT NULL,
      participant_a_name TEXT,
      participant_b_name TEXT,
      participant_a_avatar TEXT,
      participant_b_avatar TEXT,
      subject TEXT,
      last_message_preview TEXT,
      last_message_sender_id UUID REFERENCES users(id) ON DELETE SET NULL,
      last_message_at TIMESTAMP WITH TIME ZONE,
      unread_count_a INTEGER NOT NULL DEFAULT 0,
      unread_count_b INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chat_conversations_participants_different CHECK (participant_a_id <> participant_b_id)
    );

    -- Messages table
    CREATE TABLE IF NOT EXISTS chat_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
      sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sender_name TEXT NOT NULL,
      sender_role TEXT NOT NULL,
      receiver_role TEXT NOT NULL,
      message TEXT NOT NULL,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      read_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_thread_key ON chat_conversations(thread_key);
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_participant_a ON chat_conversations(participant_a_id);
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_participant_b ON chat_conversations(participant_b_id);
    CREATE INDEX IF NOT EXISTS idx_chat_conversations_updated_at ON chat_conversations(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_id ON chat_messages(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON chat_messages(sender_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_receiver_id ON chat_messages(receiver_id);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON chat_messages(created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_read ON chat_messages(read);

    -- Enable RLS
    ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
    ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if rerunning
    DROP POLICY IF EXISTS "Users can read their conversations" ON chat_conversations;
    DROP POLICY IF EXISTS "Users can create conversations" ON chat_conversations;
    DROP POLICY IF EXISTS "Users can update their conversations" ON chat_conversations;
    DROP POLICY IF EXISTS "Users can read messages in their conversations" ON chat_messages;
    DROP POLICY IF EXISTS "Users can send messages" ON chat_messages;
    DROP POLICY IF EXISTS "Users can update received messages" ON chat_messages;

    -- Conversations policies
    -- NOTE: TrikeServe currently authenticates users through app state/localStorage,
    -- not Supabase Auth, so chat must be writable/readable from the client.
    CREATE POLICY "Public read access to chat conversations" ON chat_conversations
      FOR SELECT
      USING (true);

    CREATE POLICY "Public create chat conversations" ON chat_conversations
      FOR INSERT
      WITH CHECK (true);

    CREATE POLICY "Public update chat conversations" ON chat_conversations
      FOR UPDATE
      USING (true)
      WITH CHECK (true);

    -- Messages policies
    CREATE POLICY "Public read access to chat messages" ON chat_messages
      FOR SELECT
      USING (true);

    CREATE POLICY "Public create chat messages" ON chat_messages
      FOR INSERT
      WITH CHECK (true);

    CREATE POLICY "Public update chat messages" ON chat_messages
      FOR UPDATE
      USING (true)
      WITH CHECK (true);

