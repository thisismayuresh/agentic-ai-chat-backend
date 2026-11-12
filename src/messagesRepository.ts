import type { Pool } from 'pg';
import type { Message, MessagePayload } from './types.js';

type MessageRow = {
  id: string;
  chat_id: string;
  sender_id: string;
  payload: MessagePayload;
  read_receipts: Record<string, string>;
  sent_at: Date;
};

const MESSAGE_COLUMNS = 'id, chat_id, sender_id, payload, read_receipts, sent_at';

function toMessage(row: MessageRow): Message {
  return {
    messageId: row.id,
    chatId: row.chat_id,
    senderId: row.sender_id,
    payload: row.payload,
    readReceipts: row.read_receipts,
    sentAt: row.sent_at.toISOString(),
  };
}

export async function insertMessage(
  pool: Pool,
  chatId: string,
  senderId: string,
  text: string,
): Promise<Message> {
  const result = await pool.query<MessageRow>(
    `INSERT INTO messages (chat_id, sender_id, payload)
     VALUES ($1, $2, jsonb_build_object('text', $3::text))
     RETURNING ${MESSAGE_COLUMNS}`,
    [chatId, senderId, text],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Sending a message returned no row. The message was not stored.');
  }
  return toMessage(row);
}

export async function listRecentMessages(
  pool: Pool,
  chatId: string,
  limit: number,
): Promise<Message[]> {
  const result = await pool.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages
     WHERE chat_id = $1
     ORDER BY sent_at DESC, id DESC
     LIMIT $2`,
    [chatId, limit],
  );
  const messagesInDescendingOrder = result.rows.map(toMessage);
  messagesInDescendingOrder.reverse();
  return messagesInDescendingOrder;
}

export async function findMessageInChat(
  pool: Pool,
  chatId: string,
  messageId: string,
): Promise<Message | null> {
  const result = await pool.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM messages WHERE chat_id = $1 AND id = $2`,
    [chatId, messageId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return toMessage(row);
}

export async function markMessageRead(
  pool: Pool,
  chatId: string,
  messageId: string,
  userId: string,
): Promise<Message | null> {
  const readAt = new Date().toISOString();
  const result = await pool.query<MessageRow>(
    `UPDATE messages
     SET read_receipts = read_receipts || jsonb_build_object($3::text, $4::text)
     WHERE chat_id = $1 AND id = $2
     RETURNING ${MESSAGE_COLUMNS}`,
    [chatId, messageId, userId, readAt],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return toMessage(row);
}
