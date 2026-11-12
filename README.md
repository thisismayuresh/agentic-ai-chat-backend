# Chat Backend

A 1:1 chat REST API built with Node.js, TypeScript (strict), and PostgreSQL.

Users and chats are stored relationally. **Messages, read receipts, and last-seen
positions are stored as PostgreSQL `jsonb`** — this replaces the Firebase Firestore
requirement from the original brief, so the whole system runs on a single datastore.

## Tech stack

- Node.js 20+ and TypeScript in strict mode
- PostgreSQL (`jsonb` for message documents, read receipts, last-seen maps)
- Express 5, `pg`, `zod`

## Quick start

```bash
npm install
docker compose up -d          # local PostgreSQL on localhost:5432 (skip if you have your own)
cp .env.example .env          # set DATABASE_URL / PORT
npm run migrate:seed          # apply schema + 4 demo users
npm run dev                   # http://localhost:3000
```

## Verification

```bash
npm run verify       # self-contained: boots an embedded PostgreSQL + the API, runs 51 end-to-end checks
npm run typecheck    # tsc --noEmit
npm run build        # tsc -> dist/
```

With a server already running:

```bash
npm run smoke                      # against http://localhost:3000
BASE_URL=http://localhost:4000 npm run smoke
```

## API

All request and response bodies are JSON. Errors are returned as `{ "error": "<human readable message>" }`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/users` | Create a participant (helper; the brief has no user-signup endpoint) |
| POST | `/chat/create` | Create or get the 1:1 chat between two users |
| POST | `/chat/:chatId/message/send` | Send a text message |
| GET | `/chat/:chatId/messages?limit=50` | Get recent messages, oldest first |
| POST | `/chat/:chatId/message/:messageId/read` | Record a read receipt |
| POST | `/chat/:chatId/lastseen` | Record the last seen message for a user |
| GET | `/user/:userId/chats` | List a user's chats with member IDs |

Status codes: `200` success, `201` created, `400` validation failure, `403` caller is
not a chat member, `404` chat/user/message does not exist, `409` handle already taken,
`500` unexpected server error.

### 1. Create a user

```bash
curl -X POST localhost:3000/users -H 'content-type: application/json' \
  -d '{"handle":"alice","displayName":"Alice Anderson"}'
# 201 -> { "id":"…", "handle":"alice", "displayName":"Alice Anderson", "createdAt":"…" }
```

### 2. Create or get a chat

```bash
curl -X POST localhost:3000/chat/create -H 'content-type: application/json' \
  -d '{"userAId":"<uuid>","userBId":"<uuid>"}'
# 201 first time -> { "chatId":"…", "memberIds":["…","…"], "created":true }
# 200 afterwards -> same chatId, created:false  (order of userAId/userBId does not matter)
```

Members are always stored in canonical (sorted) order, so `create` is idempotent no
matter which side of the pair is passed first.

### 3. Send a message

```bash
curl -X POST localhost:3000/chat/<chatId>/message/send -H 'content-type: application/json' \
  -d '{"senderId":"<uuid>","text":"hello"}'
# 201 -> { "messageId":"…", "chatId":"…", "senderId":"…",
#          "payload":{"text":"hello"}, "readReceipts":{}, "sentAt":"2026-11-12T…Z" }
```

### 4. Get messages

```bash
curl "localhost:3000/chat/<chatId>/messages?limit=50"
# 200 -> { "messages":[ … ] }
```

Returns the **most recent** `limit` messages (1–100, default 50) ordered ascending by
`sentAt`. Ordering ties break on message id, so the order is always deterministic.

### 5. Mark a message read

```bash
curl -X POST localhost:3000/chat/<chatId>/message/<messageId>/read \
  -H 'content-type: application/json' -d '{"userId":"<uuid>"}'
# 200 -> the message with readReceipts updated:
#        "readReceipts": { "<userId>": "2026-11-12T…Z" }
```

### 6. Update last seen

```bash
curl -X POST localhost:3000/chat/<chatId>/lastseen -H 'content-type: application/json' \
  -d '{"userId":"<uuid>","messageId":"<uuid>"}'
# 200 -> { "chatId":"…", "userId":"…", "lastSeenMessageId":"…",
#          "lastSeenMessages": { "<userId>": "<messageId>" } }
```

### 7. List a user's chats

```bash
curl localhost:3000/user/<userId>/chats
# 200 -> { "chats":[ { "chatId":"…", "memberIds":["…","…"],
#                      "lastSeenMessages":{…}, "createdAt":"…" } ] }
```

## Storage design

```sql
messages (
  id             UUID PRIMARY KEY,
  chat_id        UUID REFERENCES chats(id),
  sender_id      UUID REFERENCES users(id),
  payload        JSONB NOT NULL,      -- { "text": "hello" }
  read_receipts  JSONB NOT NULL,      -- { "<userId>": "<ISO timestamp>" }
  sent_at        TIMESTAMPTZ NOT NULL
)
chats (
  …
  last_seen_messages JSONB NOT NULL,  -- { "<userId>": "<messageId>" }
)
```

Why this shape:

- The document data of the chat world (message body, per-user read receipts,
  per-user last-seen pointer) lives in `jsonb` columns, matching the document-style
  access the brief originally assigned to Firestore.
- Columns that must be filtered, joined, or ordered (`chat_id`, `sent_at`,
  membership columns) stay relational and indexed
  (`messages_chat_sent_at_idx`), instead of hiding timestamps inside a JSON blob.
- One row per message keeps concurrent writers isolated and lets PostgreSQL do the
  ordering/pagination; a single `jsonb` array of messages per chat would mean
  read-modify-write contention on every send.

## Behaviour notes

- Only chat members may send, read, or update last-seen; others get `403`.
- `POST /chat/create` validates that both users exist (`404`) and differ (`400`).
- No authentication layer: `senderId`/`userId` come from the request body, as in the
  brief. Put auth in front before any real deployment.
- `GET messages` does not move last-seen; clients call `/lastseen` explicitly.

## Project layout

```
sql/            migration.sql (schema), seed.sql (demo users)
src/
  index.ts        entry point: config, pool, listen, graceful shutdown
  app.ts          Express wiring + error handling
  chatRoutes.ts   all /chat/* endpoints
  userRoutes.ts   /users and /user/:userId/chats
  *Repository.ts  SQL for users, chats, messages
  validation.ts   zod schemas + parseOrThrow
  db.ts           pool factory + migration runner
  errors.ts       HttpError
  types.ts        shared domain types
scripts/
  migrate.ts      npm run migrate [--seed]
  smoke.ts        npm run smoke against a running server
  smoke-tests.ts  the end-to-end checks (shared by smoke/verify)
  verify.ts       npm run verify (embedded PostgreSQL, no setup needed)
```

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Server with reload (`tsx watch`) |
| `npm run build` / `npm start` | Compile to `dist/` and run with plain Node |
| `npm run typecheck` | Strict type check |
| `npm run migrate` | Apply `sql/migration.sql` |
| `npm run migrate:seed` | Apply migration + `sql/seed.sql` |
| `npm run verify` | Embedded PostgreSQL + API + 51 end-to-end checks |
| `npm run smoke` | End-to-end checks against an already-running server |

## Not implemented (brief extras)

- Group chats (bonus)
- Message edit/delete (bonus)
