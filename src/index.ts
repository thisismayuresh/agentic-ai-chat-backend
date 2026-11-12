import type { Server } from 'node:http';
import type { Pool } from 'pg';
import { createApp } from './app.js';
import { requireEnv } from './config.js';
import { createPool } from './db.js';

function readPort(): number {
  const rawPort = process.env.PORT ?? '3000';
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, but was "${rawPort}".`);
  }
  return port;
}

async function main(): Promise<void> {
  const port = readPort();
  const pool = createPool(requireEnv('DATABASE_URL'));
  const app = createApp(pool);
  const server = await listen(app, port);
  const address = server.address();
  const boundPort = typeof address === 'object' && address !== null ? address.port : port;
  console.log(`Chat backend listening on http://localhost:${boundPort}`);

  registerShutdown('SIGINT', server, pool);
  registerShutdown('SIGTERM', server, pool);
}

function listen(app: ReturnType<typeof createApp>, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => resolve(server));
    server.once('error', reject);
  });
}

function registerShutdown(signalName: 'SIGINT' | 'SIGTERM', server: Server, pool: Pool): void {
  process.on(signalName, () => {
    console.log(`Received ${signalName}, closing the server and the database pool.`);
    server.close();
    pool
      .end()
      .then(() => process.exit(0))
      .catch((error: unknown) => {
        console.error('Shutdown failed:', error);
        process.exit(1);
      });
  });
}

main().catch((error: unknown) => {
  console.error('Failed to start the chat backend:', error);
  process.exit(1);
});
