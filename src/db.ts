import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

export function createPool(databaseUrl: string): Pool {
  return new Pool({
    connectionString: databaseUrl,
    max: 10,
  });
}

export async function applyMigrations(pool: Pool, options: { seed: boolean }): Promise<void> {
  const migrationSql = await readSqlFile('migration.sql');
  await pool.query(migrationSql);
  if (!options.seed) {
    return;
  }
  const seedSql = await readSqlFile('seed.sql');
  await pool.query(seedSql);
}

async function readSqlFile(fileName: string): Promise<string> {
  const filePath = path.join(process.cwd(), 'sql', fileName);
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    throw new Error(`Could not read migration file "${filePath}". Run npm scripts from the project root directory.`);
  }
}
