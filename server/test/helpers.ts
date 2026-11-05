import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PGlite } from '@electric-sql/pglite';

import { createApp } from '../src/app.js';
import type { Config } from '../src/config.js';
import type { Db, Queryable } from '../src/db.js';
import type { GoogleClient, GoogleIdentity } from '../src/lib/google.js';

const migrationsDir = fileURLToPath(new URL('../migrations/', import.meta.url));

export const testConfig: Config = {
  port: 0,
  databaseUrl: 'unused',
  databaseSsl: false,
  jwtSecret: 'test-secret-test-secret-test-secret-123',
  accessTokenTtlS: 900,
  refreshTokenTtlDays: 30,
  publicUrl: 'https://api.test',
  googleClientId: 'client',
  googleClientSecret: 'secret',
  appRedirectSchemes: ['asta'],
  rateLimit: false,
};

export type TestDb = { db: Db; pg: PGlite };

/** In-process Postgres (PGlite) with the real migrations applied. No Docker or network needed. */
export async function createTestDb(): Promise<TestDb> {
  // Same numeric handling as the node-postgres adapter in src/db.ts.
  const pg = new PGlite({ parsers: { 1700: (v: string) => parseFloat(v) } });
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    await pg.exec(readFileSync(migrationsDir + file, 'utf8'));
  }

  const db: Db = {
    asUser: (userId, fn) =>
      pg.transaction(async (tx) => {
        await tx.exec('set local role app_user');
        await tx.query(`select set_config('app.user_id', $1, true)`, [userId]);
        return fn(tx as unknown as Queryable);
      }),
    asService: (fn) => pg.transaction((tx) => fn(tx as unknown as Queryable)),
    close: () => pg.close(),
  };
  return { db, pg };
}

/** Fake Google: `identities` maps an authorization code to who that code "belongs to". */
export function fakeGoogle(identities: Record<string, GoogleIdentity> = {}, configured = true) {
  const client: GoogleClient = {
    configured,
    authUrl: (state) => `https://google.test/auth?state=${encodeURIComponent(state)}`,
    async exchangeCode(code) {
      const identity = identities[code];
      if (!identity) throw new Error('bad code');
      return identity;
    },
  };
  return { client, identities };
}

export async function createTestApp(opts: { googleConfigured?: boolean } = {}) {
  const { db, pg } = await createTestDb();
  const google = fakeGoogle({}, opts.googleConfigured ?? true);
  const app = createApp({ db, config: testConfig, google: google.client });
  return { app, db, pg, google };
}
