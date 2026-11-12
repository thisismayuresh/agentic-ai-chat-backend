import type { Pool } from 'pg';
import type { Chat } from './types.js';

type ChatRow = {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_seen_messages: Record<string, string>;
  created_at: Date;
};

const CHAT_COLUMNS = 'id, user_a_id, user_b_id, last_seen_messages, created_at';

function toChat(row: ChatRow): Chat {
  return {
    chatId: row.id,
    memberIds: [row.user_a_id, row.user_b_id],
    lastSeenMessages: row.last_seen_messages,
    createdAt: row.created_at.toISOString(),
  };
}

export async function createOrGetChat(
  pool: Pool,
  userAId: string,
  userBId: string,
): Promise<{ chat: Chat; created: boolean }> {
  const firstMemberId = userAId < userBId ? userAId : userBId;
  const secondMemberId = userAId < userBId ? userBId : userAId;

  const existingChat = await findChatByMembers(pool, firstMemberId, secondMemberId);
  if (existingChat) {
    return { chat: existingChat, created: false };
  }

  const insertResult = await pool.query<ChatRow>(
    `INSERT INTO chats (user_a_id, user_b_id)
     VALUES ($1, $2)
     ON CONFLICT (user_a_id, user_b_id) DO NOTHING
     RETURNING ${CHAT_COLUMNS}`,
    [firstMemberId, secondMemberId],
  );
  const insertedRow = insertResult.rows[0];
  if (insertedRow) {
    return { chat: toChat(insertedRow), created: true };
  }

  const chatFromRace = await findChatByMembers(pool, firstMemberId, secondMemberId);
  if (!chatFromRace) {
    throw new Error('The chat could not be created or found. Please retry the request.');
  }
  return { chat: chatFromRace, created: false };
}

export async function findChatById(pool: Pool, chatId: string): Promise<Chat | null> {
  const result = await pool.query<ChatRow>(
    `SELECT ${CHAT_COLUMNS} FROM chats WHERE id = $1`,
    [chatId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return toChat(row);
}

export async function listChatsByUser(pool: Pool, userId: string): Promise<Chat[]> {
  const result = await pool.query<ChatRow>(
    `SELECT ${CHAT_COLUMNS} FROM chats
     WHERE user_a_id = $1 OR user_b_id = $1
     ORDER BY created_at DESC`,
    [userId],
  );
  return result.rows.map(toChat);
}

export async function isChatMember(pool: Pool, chatId: string, userId: string): Promise<boolean> {
  const result = await pool.query(
    'SELECT 1 FROM chats WHERE id = $1 AND (user_a_id = $2 OR user_b_id = $2)',
    [chatId, userId],
  );
  return result.rows.length > 0;
}

export async function updateLastSeenMessage(
  pool: Pool,
  chatId: string,
  userId: string,
  messageId: string,
): Promise<Chat | null> {
  const result = await pool.query<ChatRow>(
    `UPDATE chats
     SET last_seen_messages = last_seen_messages || jsonb_build_object($2::text, $3::text)
     WHERE id = $1
     RETURNING ${CHAT_COLUMNS}`,
    [chatId, userId, messageId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return toChat(row);
}

async function findChatByMembers(
  pool: Pool,
  firstMemberId: string,
  secondMemberId: string,
): Promise<Chat | null> {
  const result = await pool.query<ChatRow>(
    `SELECT ${CHAT_COLUMNS} FROM chats
     WHERE user_a_id = $1 AND user_b_id = $2`,
    [firstMemberId, secondMemberId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return toChat(row);
}
