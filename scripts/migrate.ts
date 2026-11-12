import { requireEnv } from '../src/config.js';
import { applyMigrations, createPool } from '../src/db.js';

async function main(): Promise<void> {
  const shouldSeed = process.argv.includes('--seed');
  const pool = createPool(requireEnv('DATABASE_URL'));
  try {
    await applyMigrations(pool, { seed: shouldSeed });
    const suffix = shouldSeed ? ' (including seed data)' : '';
    console.log(`Migrations applied${suffix}.`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error);
  process.exit(1);
});
