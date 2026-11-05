import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import type { Config } from '../config.js';
import type { Db, Queryable } from '../db.js';
import { HttpError, isUniqueViolation } from '../errors.js';
import type { GoogleClient } from '../lib/google.js';
import { hashPassword, MAX_PASSWORD_BYTES, verifyPassword } from '../lib/passwords.js';
import { newSecret, sha256, signAccessToken, signState, verifyState } from '../lib/tokens.js';

type Deps = { db: Db; config: Config; google: GoogleClient };

const email = z.string().trim().toLowerCase().email().max(254);
const registerBody = z.object({
  email,
  password: z
    .string()
    .min(8, 'Use at least 8 characters')
    .refine((p) => Buffer.byteLength(p) <= MAX_PASSWORD_BYTES, 'Password is too long'),
});
// No length rules on login: do not reveal the password policy to someone guessing.
const loginBody = z.object({ email, password: z.string().min(1) });
const refreshBody = z.object({ refreshToken: z.string().min(1) });
const exchangeBody = z.object({ code: z.string().min(1) });

async function issueTokens(q: Queryable, user: { id: string; email: string }, config: Config) {
  const refreshToken = newSecret();
  await q.query(
    `insert into refresh_tokens (user_id, token_hash, expires_at)
     values ($1, $2, now() + make_interval(days => $3::int))`,
    [user.id, sha256(refreshToken), config.refreshTokenTtlDays],
  );
  return {
    user: { id: user.id, email: user.email },
    accessToken: signAccessToken(user.id, config),
    refreshToken,
    expiresIn: config.accessTokenTtlS,
  };
}

const isAllowedRedirect = (uri: string, schemes: string[]) => {
  try {
    return schemes.includes(new URL(uri).protocol.replace(':', ''));
  } catch {
    return false;
  }
};

export function authRouter({ db, config, google }: Deps) {
  const router = Router();

  if (config.rateLimit) {
    // Slows password guessing and signup spam. Counted per client IP (trust proxy is set for Render).
    router.use(
      rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 50,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
      }),
    );
  }

  router.post('/register', async (req, res) => {
    const body = registerBody.parse(req.body);
    const passwordHash = await hashPassword(body.password);
    try {
      const result = await db.asService(async (q) => {
        const { rows } = await q.query<{ id: string }>(
          `insert into users (email, password_hash) values ($1, $2) returning id`,
          [body.email, passwordHash],
        );
        return issueTokens(q, { id: rows[0]!.id, email: body.email }, config);
      });
      res.status(201).json(result);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new HttpError(409, 'email_taken', 'That email is already registered');
      throw err;
    }
  });

  router.post('/login', async (req, res) => {
    const body = loginBody.parse(req.body);
    const user = await db.asService(async (q) => {
      const { rows } = await q.query<{ id: string; password_hash: string | null }>(
        `select id, password_hash from users where email = $1`,
        [body.email],
      );
      return rows[0] ?? null;
    });
    const ok = await verifyPassword(body.password, user?.password_hash ?? null);
    if (!user || !ok) throw new HttpError(401, 'invalid_credentials', 'Wrong email or password');
    res.json(await db.asService((q) => issueTokens(q, { id: user.id, email: body.email }, config)));
  });

  // Refresh-token rotation: every use revokes the presented token and issues a new one. Presenting an
  // already-revoked token means it was stolen (or replayed), so the whole session family is revoked.
  router.post('/refresh', async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body);
    const outcome = await db.asService(async (q) => {
      const { rows } = await q.query<{
        id: string;
        user_id: string;
        email: string;
        expires_at: Date;
        revoked_at: Date | null;
      }>(
        `select t.id, t.user_id, u.email, t.expires_at, t.revoked_at
         from refresh_tokens t join users u on u.id = t.user_id
         where t.token_hash = $1 for update of t`,
        [sha256(refreshToken)],
      );
      const row = rows[0];
      if (!row) return { ok: false as const };
      if (row.revoked_at) {
        await q.query(
          `update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`,
          [row.user_id],
        );
        return { ok: false as const };
      }
      if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false as const };
      await q.query(`update refresh_tokens set revoked_at = now() where id = $1`, [row.id]);
      return {
        ok: true as const,
        tokens: await issueTokens(q, { id: row.user_id, email: row.email }, config),
      };
    });
    // Thrown outside the transaction so the family revocation above is committed, not rolled back.
    if (!outcome.ok) throw new HttpError(401, 'invalid_refresh_token');
    res.json(outcome.tokens);
  });

  router.post('/logout', async (req, res) => {
    const { refreshToken } = refreshBody.parse(req.body);
    await db.asService((q) =>
      q.query(
        `update refresh_tokens set revoked_at = now() where token_hash = $1 and revoked_at is null`,
        [sha256(refreshToken)],
      ),
    );
    res.status(204).end();
  });

  // --- Google sign-in -----------------------------------------------------------------------------
  // Flow: app opens /auth/google/start in an in-app browser -> Google -> /auth/google/callback ->
  // redirect to the app's deep link with a one-time code -> app POSTs the code to /auth/google/exchange.
  // Google only ever talks to this server; no Google secret or SDK lives in the app.

  router.get('/google/start', (req, res) => {
    if (!google.configured) throw new HttpError(503, 'google_not_configured');
    const redirectUri = String(req.query.redirect_uri ?? '');
    // Allowlist, otherwise this endpoint could be used to send the login code to any URL.
    if (!isAllowedRedirect(redirectUri, config.appRedirectSchemes)) {
      throw new HttpError(400, 'invalid_redirect_uri');
    }
    res.redirect(google.authUrl(signState({ redirectUri }, config)));
  });

  router.get('/google/callback', async (req, res) => {
    const state = verifyState(String(req.query.state ?? ''), config);
    if (!state) throw new HttpError(400, 'invalid_state');
    const back = new URL(state.redirectUri);

    const code = String(req.query.code ?? '');
    if (req.query.error || !code) {
      back.searchParams.set('error', 'cancelled');
      return res.redirect(back.toString());
    }

    let identity;
    try {
      identity = await google.exchangeCode(code);
    } catch (err) {
      console.error('google exchange failed', err);
      back.searchParams.set('error', 'google_failed');
      return res.redirect(back.toString());
    }
    if (!identity.emailVerified) {
      back.searchParams.set('error', 'email_not_verified');
      return res.redirect(back.toString());
    }

    const loginCode = newSecret();
    await db.asService(async (q) => {
      const bySub = await q.query<{ id: string }>(`select id from users where google_sub = $1`, [
        identity.sub,
      ]);
      let userId = bySub.rows[0]?.id;
      if (!userId) {
        const byEmail = await q.query<{ id: string }>(`select id from users where email = $1`, [
          identity.email,
        ]);
        userId = byEmail.rows[0]?.id;
        if (userId) {
          // Linking to an existing password account. Emails are not verified at password signup, so
          // someone could have pre-registered this address; drop that password and its sessions so
          // only the verified Google owner controls the account from here on.
          await q.query(`update users set google_sub = $1, password_hash = null where id = $2`, [
            identity.sub,
            userId,
          ]);
          await q.query(
            `update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null`,
            [userId],
          );
        } else {
          const created = await q.query<{ id: string }>(
            `insert into users (email, google_sub) values ($1, $2) returning id`,
            [identity.email, identity.sub],
          );
          userId = created.rows[0]!.id;
          if (identity.name) {
            await q.query(`update profiles set display_name = $1 where id = $2`, [
              identity.name.slice(0, 40),
              userId,
            ]);
          }
        }
      }
      await q.query(
        `insert into auth_codes (code_hash, user_id, expires_at) values ($1, $2, now() + interval '2 minutes')`,
        [sha256(loginCode), userId],
      );
    });

    back.searchParams.set('code', loginCode);
    res.redirect(back.toString());
  });

  router.post('/google/exchange', async (req, res) => {
    const { code } = exchangeBody.parse(req.body);
    const result = await db.asService(async (q) => {
      // Single atomic statement: a code can be redeemed exactly once, and only before it expires.
      const used = await q.query<{ user_id: string }>(
        `update auth_codes set used_at = now()
         where code_hash = $1 and used_at is null and expires_at > now() returning user_id`,
        [sha256(code)],
      );
      const userId = used.rows[0]?.user_id;
      if (!userId) return null;
      const u = await q.query<{ email: string }>(`select email from users where id = $1`, [userId]);
      return issueTokens(q, { id: userId, email: u.rows[0]!.email }, config);
    });
    if (!result) throw new HttpError(401, 'invalid_code');
    res.json(result);
  });

  return router;
}
