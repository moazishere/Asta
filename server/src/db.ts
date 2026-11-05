import pg from 'pg';

export type Queryable = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<{ rows: T[] }>;
};

export type Db = {
  /**
   * Runs `fn` in a transaction as the low-privilege `app_user` role, with `app.user_id` set to the
   * caller so Row Level Security applies. Use this for ALL reads/writes of user data.
   */
  asUser<T>(userId: string, fn: (q: Queryable) => Promise<T>): Promise<T>;
  /**
   * Runs `fn` in a transaction as the database owner (bypasses RLS). Only for the auth tables
   * (users, refresh_tokens, auth_codes), which app_user cannot touch at all.
   */
  asService<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

// node-postgres returns numeric/decimal (OID 1700) as strings; our values (km, kg, cm) fit in a double.
pg.types.setTypeParser(1700, (v) => parseFloat(v));

export function createPgDb(opts: { url: string; ssl: boolean }): Db {
  // Hosted Postgres (Supabase) presents a certificate chain Node does not trust by default.
  const pool = new pg.Pool({
    connectionString: opts.url,
    ssl: opts.ssl ? { rejectUnauthorized: false } : false,
    max: 10,
  });

  async function tx<T>(
    setup: (c: pg.PoolClient) => Promise<void>,
    fn: (q: Queryable) => Promise<T>,
  ) {
    const client = await pool.connect();
    try {
      await client.query('begin');
      await setup(client);
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  return {
    asUser: (userId, fn) =>
      tx(async (c) => {
        // Both are transaction-local (`local` / `true`), so they cannot leak to the next request
        // that reuses this pooled connection.
        await c.query('set local role app_user');
        await c.query(`select set_config('app.user_id', $1, true)`, [userId]);
      }, fn),
    asService: (fn) => tx(async () => undefined, fn),
    close: () => pool.end(),
  };
}
