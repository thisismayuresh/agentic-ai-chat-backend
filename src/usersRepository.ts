import type { Pool } from 'pg';
import type { User } from './types.js';

type UserRow = {
  id: string;
  handle: string;
  display_name: string;
  created_at: Date;
};

const USER_COLUMNS = 'id, handle, display_name, created_at';

function toUser(row: UserRow): User {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    createdAt: row.created_at.toISOString(),
  };
}

export async function findUserById(pool: Pool, userId: string): Promise<User | null> {
  const result = await pool.query<UserRow>(
    `SELECT ${USER_COLUMNS} FROM users WHERE id = $1`,
    [userId],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  return toUser(row);
}

export async function createUser(pool: Pool, handle: string, displayName: string): Promise<User> {
  const result = await pool.query<UserRow>(
    `INSERT INTO users (handle, display_name)
     VALUES ($1, $2)
     RETURNING ${USER_COLUMNS}`,
    [handle, displayName],
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('Creating a user returned no row. The database may be unavailable.');
  }
  return toUser(row);
}
