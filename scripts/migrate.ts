import {config} from 'dotenv';
import {readdir, readFile} from 'node:fs/promises';
import {getPool, closeDatabase} from '../src/db/index';
config({path: process.env.NODE_ENV === 'test' ? '.env.test.local' : '.env.local', quiet:true});
const client = await getPool().connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(191233, 0)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const file of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) {
    const done = await client.query('SELECT name FROM schema_migrations WHERE name=$1',[file]);
    if (done.rowCount) continue;
    await client.query(await readFile(`migrations/${file}`, 'utf8'));
    await client.query('INSERT INTO schema_migrations(name) VALUES($1)', [file]);
    console.log(`Migration appliquée : ${file}`);
  }
  await client.query('COMMIT');
} catch(error) { await client.query('ROLLBACK'); throw error; }
finally { client.release(); await closeDatabase(); }
