import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const globalDatabase = globalThis as unknown as {prismePool?: Pool};
export function getPool(): Pool {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL manque : lancez npm run setup.');
  if (!globalDatabase.prismePool) globalDatabase.prismePool = new Pool({connectionString: process.env.DATABASE_URL, max: 8});
  return globalDatabase.prismePool;
}
export function getDatabase() { return drizzle(getPool(), {schema}); }
export async function closeDatabase() {
  if (globalDatabase.prismePool) await globalDatabase.prismePool.end();
  delete globalDatabase.prismePool;
}
