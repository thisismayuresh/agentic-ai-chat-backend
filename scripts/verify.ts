import { mkdtemp } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import { createApp } from '../src/app.js';
import { applyMigrations, createPool } from '../src/db.js';
import { runSmokeTests } from './smoke-tests.js';

const EMBEDDED_POSTGRES_PORT = 55432;
const EMBEDDED_POSTGRES_USER = 'postgres';
const EMBEDDED_POSTGRES_PASSWORD = 'password';
const VERIFY_DATABASE_NAME = 'chat_verify';

async function main(): Promise<void> {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), 'chat-verify-pg-'));
  const embeddedPostgres = new EmbeddedPostgres({
    databaseDir: dataDirectory,
    port: EMBEDDED_POSTGRES_PORT,
    user: EMBEDDED_POSTGRES_USER,
    password: EMBEDDED_POSTGRES_PASSWORD,
    persistent: false,
    onLog: () => {},
    onError: (message) => console.error(message),
  });

  await embeddedPostgres.initialise();
  await embeddedPostgres.start();
  await embeddedPostgres.createDatabase(VERIFY_DATABASE_NAME);

  const databaseUrl = `postgres://${EMBEDDED_POSTGRES_USER}:${EMBEDDED_POSTGRES_PASSWORD}@localhost:${EMBEDDED_POSTGRES_PORT}/${VERIFY_DATABASE_NAME}`;
  const pool = createPool(databaseUrl);
  const app = createApp(pool);
  let server: Server | undefined;

  try {
    await applyMigrations(pool, { seed: false });
    server = app.listen(0);
    await waitForListening(server);
    const baseUrl = readBaseUrl(server);
    console.log(`Verify server running at ${baseUrl} against an embedded PostgreSQL instance.`);
    await runSmokeTests(baseUrl);
    console.log('Verify passed: every end-to-end check succeeded.');
  } finally {
    if (server) {
      server.closeAllConnections();
      server.close();
    }
    await pool.end();
    await embeddedPostgres.stop();
  }
}

function waitForListening(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
}

function readBaseUrl(server: Server): string {
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('The verify server did not report a TCP port.');
  }
  const port = (address as AddressInfo).port;
  return `http://127.0.0.1:${port}`;
}

main().catch((error: unknown) => {
  console.error('Verify failed:', error);
  process.exit(1);
});
