CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  handle TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_handle_format CHECK (handle ~ '^[a-z0-9_]{3,32}$')
);

CREATE TABLE IF NOT EXISTS chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES users (id),
  user_b_id UUID NOT NULL REFERENCES users (id),
  last_seen_messages JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chats_members_distinct CHECK (user_a_id <> user_b_id),
  CONSTRAINT chats_members_ordered CHECK (user_a_id < user_b_id),
  CONSTRAINT chats_unique_pair UNIQUE (user_a_id, user_b_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id UUID NOT NULL REFERENCES chats (id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users (id),
  payload JSONB NOT NULL,
  read_receipts JSONB NOT NULL DEFAULT '{}'::jsonb,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT messages_payload_has_text CHECK (jsonb_typeof(payload -> 'text') = 'string')
);

CREATE INDEX IF NOT EXISTS messages_chat_sent_at_idx ON messages (chat_id, sent_at DESC);
