import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import pg from 'pg';

// Minimal migration runner: applies server/migrations/*.sql in name order, once each, each in its own
// transaction. Run with `npm run migrate` (needs DATABASE_URL, and DATABASE_SSL=disable for local DBs).
const dir = fileURLToPath(new URL('../migrations/', import.meta.url));

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');

const client = new pg.Client({
  connectionString: url,
  ssl: process.env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false },
});
await client.connect();
try {
  await client.query(
    `create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`,
  );
  const done = new Set(
    (await client.query<{ name: string }>('select name from schema_migrations')).rows.map(
      (r) => r.name,
    ),
  );
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (done.has(file)) continue;
    console.log(`applying ${file}`);
    await client.query('begin');
    try {
      await client.query(readFileSync(dir + file, 'utf8'));
      await client.query('insert into schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  }
  console.log('migrations up to date');
} finally {
  await client.end();
}
