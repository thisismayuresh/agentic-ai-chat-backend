import { Router } from 'express';
import type { Pool } from 'pg';
import { HttpError } from './errors.js';
import {
  chatParamsSchema,
  createChatBodySchema,
  lastSeenBodySchema,
  listMessagesQuerySchema,
  markReadBodySchema,
  messageParamsSchema,
  parseOrThrow,
  sendMessageBodySchema,
} from './validation.js';
import {
  createOrGetChat,
  findChatById,
  isChatMember,
  updateLastSeenMessage,
} from './chatsRepository.js';
import { findMessageInChat, insertMessage, listRecentMessages, markMessageRead } from './messagesRepository.js';
import { findUserById } from './usersRepository.js';

export function createChatRouter(pool: Pool): Router {
  const router = Router();

  async function requireChat(chatId: string) {
    const chat = await findChatById(pool, chatId);
    if (!chat) {
      throw new HttpError(404, `Chat ${chatId} was not found.`);
    }
    return chat;
  }

  async function requireMembership(chatId: string, userId: string): Promise<void> {
    const isMember = await isChatMember(pool, chatId, userId);
    if (!isMember) {
      throw new HttpError(403, `User ${userId} is not a member of chat ${chatId}.`);
    }
  }

  router.post('/chat/create', async (request, response) => {
    const body = parseOrThrow(createChatBodySchema, request.body, 'request body');
    if (body.userAId === body.userBId) {
      throw new HttpError(400, 'userAId and userBId must be two different users.');
    }
    const userA = await findUserById(pool, body.userAId);
    if (!userA) {
      throw new HttpError(404, `User ${body.userAId} was not found.`);
    }
    const userB = await findUserById(pool, body.userBId);
    if (!userB) {
      throw new HttpError(404, `User ${body.userBId} was not found.`);
    }

    const result = await createOrGetChat(pool, body.userAId, body.userBId);
    const statusCode = result.created ? 201 : 200;
    response.status(statusCode).json({
      chatId: result.chat.chatId,
      memberIds: result.chat.memberIds,
      created: result.created,
    });
  });

  router.post('/chat/:chatId/message/send', async (request, response) => {
    const params = parseOrThrow(chatParamsSchema, request.params, 'path parameters');
    const body = parseOrThrow(sendMessageBodySchema, request.body, 'request body');
    await requireChat(params.chatId);
    await requireMembership(params.chatId, body.senderId);

    const message = await insertMessage(pool, params.chatId, body.senderId, body.text);
    response.status(201).json(message);
  });

  router.get('/chat/:chatId/messages', async (request, response) => {
    const params = parseOrThrow(chatParamsSchema, request.params, 'path parameters');
    const query = parseOrThrow(listMessagesQuerySchema, request.query, 'query string');
    await requireChat(params.chatId);

    const messages = await listRecentMessages(pool, params.chatId, query.limit);
    response.json({ messages });
  });

  router.post('/chat/:chatId/message/:messageId/read', async (request, response) => {
    const params = parseOrThrow(messageParamsSchema, request.params, 'path parameters');
    const body = parseOrThrow(markReadBodySchema, request.body, 'request body');
    await requireChat(params.chatId);
    await requireMembership(params.chatId, body.userId);

    const message = await markMessageRead(pool, params.chatId, params.messageId, body.userId);
    if (!message) {
      throw new HttpError(404, `Message ${params.messageId} was not found in chat ${params.chatId}.`);
    }
    response.json(message);
  });

  router.post('/chat/:chatId/lastseen', async (request, response) => {
    const params = parseOrThrow(chatParamsSchema, request.params, 'path parameters');
    const body = parseOrThrow(lastSeenBodySchema, request.body, 'request body');
    await requireChat(params.chatId);
    await requireMembership(params.chatId, body.userId);

    const targetMessage = await findMessageInChat(pool, params.chatId, body.messageId);
    if (!targetMessage) {
      throw new HttpError(404, `Message ${body.messageId} was not found in chat ${params.chatId}.`);
    }
    const chat = await updateLastSeenMessage(pool, params.chatId, body.userId, body.messageId);
    if (!chat) {
      throw new HttpError(404, `Chat ${params.chatId} was not found.`);
    }
    response.json({
      chatId: chat.chatId,
      userId: body.userId,
      lastSeenMessageId: body.messageId,
      lastSeenMessages: chat.lastSeenMessages,
    });
  });

  return router;
}
