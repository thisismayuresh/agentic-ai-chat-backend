import { Router } from 'express';
import { DatabaseError } from 'pg';
import type { Pool } from 'pg';
import { HttpError } from './errors.js';
import { createUserBodySchema, parseOrThrow, userParamsSchema } from './validation.js';
import { createUser, findUserById } from './usersRepository.js';
import { listChatsByUser } from './chatsRepository.js';

const UNIQUE_VIOLATION_CODE = '23505';

export function createUserRouter(pool: Pool): Router {
  const router = Router();

  router.post('/users', async (request, response) => {
    const body = parseOrThrow(createUserBodySchema, request.body, 'request body');
    try {
      const user = await createUser(pool, body.handle, body.displayName);
      response.status(201).json(user);
    } catch (error) {
      if (error instanceof DatabaseError && error.code === UNIQUE_VIOLATION_CODE) {
        throw new HttpError(409, `Handle "${body.handle}" is already taken.`);
      }
      throw error;
    }
  });

  router.get('/user/:userId/chats', async (request, response) => {
    const params = parseOrThrow(userParamsSchema, request.params, 'path parameters');
    const user = await findUserById(pool, params.userId);
    if (!user) {
      throw new HttpError(404, `User ${params.userId} was not found.`);
    }
    const chats = await listChatsByUser(pool, params.userId);
    response.json({ chats });
  });

  return router;
}
