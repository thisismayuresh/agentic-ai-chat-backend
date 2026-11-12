import { z } from 'zod';
import { HttpError } from './errors.js';

const uuidSchema = z.uuid().transform((value) => value.toLowerCase());

export const createChatBodySchema = z.object({
  userAId: uuidSchema,
  userBId: uuidSchema,
});

export const sendMessageBodySchema = z.object({
  senderId: uuidSchema,
  text: z
    .string()
    .trim()
    .min(1, 'text must not be empty')
    .max(4000, 'text must be at most 4000 characters'),
});

export const markReadBodySchema = z.object({
  userId: uuidSchema,
});

export const lastSeenBodySchema = z.object({
  userId: uuidSchema,
  messageId: uuidSchema,
});

export const createUserBodySchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, 'handle must be at least 3 characters')
    .max(32, 'handle must be at most 32 characters')
    .regex(/^[a-z0-9_]+$/, 'handle may only contain lowercase letters, digits and underscores'),
  displayName: z.string().trim().min(1, 'displayName must not be empty').max(80),
});

export const chatParamsSchema = z.object({
  chatId: uuidSchema,
});

export const messageParamsSchema = z.object({
  chatId: uuidSchema,
  messageId: uuidSchema,
});

export const userParamsSchema = z.object({
  userId: uuidSchema,
});

export const listMessagesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export function parseOrThrow<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  const issueMessages = result.error.issues.map((issue) => {
    const fieldPath = issue.path.join('.');
    if (!fieldPath) {
      return issue.message;
    }
    return `${fieldPath}: ${issue.message}`;
  });
  throw new HttpError(400, `${label} is invalid: ${issueMessages.join('; ')}`);
}
