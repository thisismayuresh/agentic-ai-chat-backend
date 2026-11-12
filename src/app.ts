import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import type { Pool } from 'pg';
import { HttpError } from './errors.js';
import { createChatRouter } from './chatRoutes.js';
import { createUserRouter } from './userRoutes.js';

export function createApp(pool: Pool) {
  const app = express();
  app.use(express.json());

  app.use(createChatRouter(pool));
  app.use(createUserRouter(pool));

  app.use((_request, response) => {
    response.status(404).json({ error: 'The requested route does not exist.' });
  });

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (response.headersSent) {
      next(error);
      return;
    }
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message });
      return;
    }
    const clientErrorStatus = readClientErrorStatus(error);
    if (clientErrorStatus !== null) {
      response.status(clientErrorStatus.status).json({ error: clientErrorStatus.message });
      return;
    }
    console.error('Unhandled request error:', error);
    response.status(500).json({ error: 'Unexpected server error. Check the server logs for details.' });
  });

  return app;
}

function readClientErrorStatus(error: unknown): { status: number; message: string } | null {
  const candidate = error as { status?: unknown; message?: unknown };
  if (typeof candidate.status !== 'number' || candidate.status < 400 || candidate.status >= 500) {
    return null;
  }
  const message = typeof candidate.message === 'string' ? candidate.message : 'Invalid request.';
  return { status: candidate.status, message };
}
