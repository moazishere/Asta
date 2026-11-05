import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import jwt from 'jsonwebtoken';
import request from 'supertest';

import { createTestApp, testConfig } from './helpers.js';

const { app, google, pg } = await createTestApp();
const api = () => request(app);

type Tokens = { accessToken: string; refreshToken: string; user: { id: string; email: string } };

async function register(email: string, password = 'correct horse'): Promise<Tokens> {
  const res = await api().post('/auth/register').send({ email, password });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body as Tokens;
}
const bearer = (t: Tokens) => ({ Authorization: `Bearer ${t.accessToken}` });

const fullProfile = {
  username: 'runner_one',
  display_name: 'Runner One',
  height_cm: 180,
  weight_kg: 75,
  birth_year: 1995,
  sex: 'male',
  daily_kcal_goal: 2400,
  timezone: 'Asia/Damascus',
  complete_onboarding: true,
};

describe('health', () => {
  it('responds without auth', async () => {
    const res = await api().get('/health');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { ok: true });
  });
  it('unknown routes return JSON 404', async () => {
    const res = await api().get('/nope');
    assert.equal(res.status, 404);
    assert.equal(res.body.error, 'not_found');
  });
});

describe('register and login', () => {
  it('registers, normalises the email and returns tokens', async () => {
    const res = await api()
      .post('/auth/register')
      .send({ email: '  Ann@Example.COM ', password: 'password123' });
    assert.equal(res.status, 201);
    assert.equal(res.body.user.email, 'ann@example.com');
    assert.ok(res.body.accessToken && res.body.refreshToken);
    assert.equal('password_hash' in res.body.user, false);
  });
  it('rejects a duplicate email (case-insensitive)', async () => {
    await register('dup@example.com');
    const res = await api()
      .post('/auth/register')
      .send({ email: 'DUP@example.com', password: 'password123' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'email_taken');
  });
  it('rejects short passwords, bad emails and over-long passwords', async () => {
    assert.equal(
      (await api().post('/auth/register').send({ email: 'a@b.co', password: 'short' })).status,
      400,
    );
    assert.equal(
      (await api().post('/auth/register').send({ email: 'nope', password: 'password123' })).status,
      400,
    );
    assert.equal(
      (
        await api()
          .post('/auth/register')
          .send({ email: 'long@b.co', password: 'x'.repeat(73) })
      ).status,
      400,
    );
  });
  it('logs in with the right password only, with the same error for unknown emails', async () => {
    await register('login@example.com', 'password123');
    const ok = await api()
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'password123' });
    assert.equal(ok.status, 200);
    const wrong = await api()
      .post('/auth/login')
      .send({ email: 'login@example.com', password: 'wrongpass1' });
    const unknown = await api()
      .post('/auth/login')
      .send({ email: 'ghost@example.com', password: 'wrongpass1' });
    assert.equal(wrong.status, 401);
    assert.equal(unknown.status, 401);
    assert.deepEqual(wrong.body, unknown.body, 'must not reveal which emails exist');
  });
  it('stores only a hash of the password and of refresh tokens', async () => {
    const t = await register('hash@example.com', 'plain-text-password');
    const user = await pg.query<{ password_hash: string }>(
      `select password_hash from users where email = 'hash@example.com'`,
    );
    assert.match(user.rows[0]!.password_hash, /^\$2[aby]\$/, 'bcrypt hash, not plaintext');
    const stored = await pg.query<{ token_hash: string }>(`select token_hash from refresh_tokens`);
    assert.ok(stored.rows.length > 0);
    assert.ok(
      stored.rows.every(
        (r) => r.token_hash !== t.refreshToken && !r.token_hash.includes(t.refreshToken),
      ),
    );
  });
});

describe('access tokens', () => {
  it('protects /me routes', async () => {
    assert.equal((await api().get('/me')).status, 401);
    assert.equal((await api().get('/me/profile')).status, 401);
    assert.equal((await api().get('/me').set('Authorization', 'Bearer garbage')).status, 401);
  });
  it('rejects tokens signed with another secret, an expired token, and alg=none', async () => {
    const t = await register('tok@example.com');
    const forged = jwt.sign({}, 'a-different-secret-a-different-secret!', { subject: t.user.id });
    const expired = jwt.sign({}, testConfig.jwtSecret, { subject: t.user.id, expiresIn: -10 });
    const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(
      JSON.stringify({ sub: t.user.id }),
    ).toString('base64url')}.`;
    for (const token of [forged, expired, none]) {
      assert.equal((await api().get('/me').set('Authorization', `Bearer ${token}`)).status, 401);
    }
  });
  it('returns the caller from /me', async () => {
    const t = await register('me@example.com');
    const res = await api().get('/me').set(bearer(t));
    assert.deepEqual(res.body, { id: t.user.id, email: 'me@example.com' });
  });
});

describe('refresh tokens', () => {
  it('rotates: the new pair works, the old refresh token does not', async () => {
    const t = await register('rot@example.com');
    const next = await api().post('/auth/refresh').send({ refreshToken: t.refreshToken });
    assert.equal(next.status, 200);
    assert.notEqual(next.body.refreshToken, t.refreshToken);
    assert.equal((await api().get('/me').set(bearer(next.body))).status, 200);
    assert.equal(
      (await api().post('/auth/refresh').send({ refreshToken: t.refreshToken })).status,
      401,
    );
  });
  it('replaying a used refresh token revokes the whole session', async () => {
    const t = await register('replay@example.com');
    const next = (await api().post('/auth/refresh').send({ refreshToken: t.refreshToken }))
      .body as Tokens;
    await api().post('/auth/refresh').send({ refreshToken: t.refreshToken }); // attacker replays old token
    assert.equal(
      (await api().post('/auth/refresh').send({ refreshToken: next.refreshToken })).status,
      401,
      'the legitimate newer token must be dead too',
    );
  });
  it('rejects unknown tokens and logout revokes', async () => {
    assert.equal((await api().post('/auth/refresh').send({ refreshToken: 'nope' })).status, 401);
    const t = await register('out@example.com');
    assert.equal(
      (await api().post('/auth/logout').send({ refreshToken: t.refreshToken })).status,
      204,
    );
    assert.equal(
      (await api().post('/auth/refresh').send({ refreshToken: t.refreshToken })).status,
      401,
    );
  });
});

describe('profile', () => {
  it('starts with a placeholder username and no onboarding', async () => {
    const t = await register('prof@example.com');
    const res = await api().get('/me/profile').set(bearer(t));
    assert.equal(res.status, 200);
    assert.match(res.body.username, /^user_[0-9a-f]{8}$/);
    assert.equal(res.body.onboarded_at, null);
  });
  it('completes onboarding with numbers returned as numbers', async () => {
    const t = await register('onb@example.com');
    const res = await api().patch('/me/profile').set(bearer(t)).send(fullProfile);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.ok(res.body.onboarded_at);
    assert.equal(res.body.username, 'runner_one');
    assert.equal(res.body.height_cm, 180);
    assert.equal(typeof res.body.weight_kg, 'number');
  });
  it('refuses to finish onboarding while required fields are missing', async () => {
    const t = await register('inc@example.com');
    const res = await api()
      .patch('/me/profile')
      .set(bearer(t))
      .send({ display_name: 'x', complete_onboarding: true });
    assert.equal(res.status, 400);
    assert.equal(res.body.error, 'incomplete_profile');
    const after = await api().get('/me/profile').set(bearer(t));
    assert.equal(after.body.onboarded_at, null);
  });
  it('returns 409 when the username is taken', async () => {
    const other = await register('taken@example.com');
    await api().patch('/me/profile').set(bearer(other)).send({ username: 'taken_name' });
    const t = await register('taker@example.com');
    const res = await api().patch('/me/profile').set(bearer(t)).send({ username: 'taken_name' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'username_taken');
  });
  it('validates ranges and rejects fields a client may not write', async () => {
    const t = await register('val@example.com');
    const patch = (body: object) => api().patch('/me/profile').set(bearer(t)).send(body);
    assert.equal((await patch({ height_cm: 5 })).status, 400);
    assert.equal((await patch({ username: 'Bad Name!' })).status, 400);
    assert.equal((await patch({ timezone: 'Mars/Olympus' })).status, 400);
    assert.equal(
      (await patch({ onboarded_at: '2020-01-01' })).status,
      400,
      'onboarded_at is server-controlled',
    );
    assert.equal((await patch({ id: t.user.id })).status, 400);
    assert.equal((await patch({})).status, 400);
  });
  it('isolates users: each sees only their own profile', async () => {
    const a = await register('iso-a@example.com');
    const b = await register('iso-b@example.com');
    await api().patch('/me/profile').set(bearer(a)).send({ username: 'iso_a' });
    await api().patch('/me/profile').set(bearer(b)).send({ username: 'iso_b' });
    assert.equal((await api().get('/me/profile').set(bearer(a))).body.username, 'iso_a');
    assert.equal((await api().get('/me/profile').set(bearer(b))).body.username, 'iso_b');
  });
});

describe('google sign-in', () => {
  const appLink = 'asta://auth-callback';
  const start = (redirect: string) =>
    api().get('/auth/google/start').query({ redirect_uri: redirect });

  async function signInWith(code: string) {
    const s = await start(appLink);
    assert.equal(s.status, 302);
    const state = new URL(s.headers.location as string).searchParams.get('state')!;
    const cb = await api().get('/auth/google/callback').query({ code, state });
    assert.equal(cb.status, 302);
    return new URL(cb.headers.location as string);
  }

  before(() => {
    google.identities['code-new'] = {
      sub: 'g-1',
      email: 'gnew@example.com',
      emailVerified: true,
      name: 'Gina New',
    };
    google.identities['code-unverified'] = {
      sub: 'g-2',
      email: 'unv@example.com',
      emailVerified: false,
      name: null,
    };
  });

  it('only redirects back to allow-listed app schemes', async () => {
    assert.equal((await start('https://evil.example/steal')).status, 400);
    assert.equal((await start('javascript:alert(1)')).status, 400);
    assert.equal((await start('')).status, 400);
    assert.equal((await start(appLink)).status, 302);
  });
  it('reports when Google is not configured', async () => {
    const t = await createTestApp({ googleConfigured: false });
    const res = await request(t.app).get('/auth/google/start').query({ redirect_uri: appLink });
    assert.equal(res.status, 503);
  });
  it('creates the user, hands a one-time code to the app, and the code works exactly once', async () => {
    const back = await signInWith('code-new');
    assert.equal(back.protocol, 'asta:');
    const code = back.searchParams.get('code')!;
    assert.ok(code);

    const ex = await api().post('/auth/google/exchange').send({ code });
    assert.equal(ex.status, 200);
    assert.equal(ex.body.user.email, 'gnew@example.com');
    const profile = await api().get('/me/profile').set(bearer(ex.body));
    assert.equal(profile.body.display_name, 'Gina New');

    assert.equal(
      (await api().post('/auth/google/exchange').send({ code })).status,
      401,
      'single use',
    );
    // Signing in again maps to the same account.
    const again = await signInWith('code-new');
    const ex2 = await api()
      .post('/auth/google/exchange')
      .send({ code: again.searchParams.get('code') });
    assert.equal(ex2.body.user.id, ex.body.user.id);
  });
  it('rejects a tampered state, a bad code, and unverified Google emails', async () => {
    const bad = await api()
      .get('/auth/google/callback')
      .query({ code: 'code-new', state: 'forged' });
    assert.equal(bad.status, 400);

    const s = await start(appLink);
    const state = new URL(s.headers.location as string).searchParams.get('state')!;
    const failed = await api().get('/auth/google/callback').query({ code: 'unknown', state });
    assert.equal(
      new URL(failed.headers.location as string).searchParams.get('error'),
      'google_failed',
    );

    const unverified = await signInWith('code-unverified');
    assert.equal(unverified.searchParams.get('error'), 'email_not_verified');
    assert.equal(unverified.searchParams.get('code'), null);
  });
  it('passes through the user cancelling on the Google screen', async () => {
    const s = await start(appLink);
    const state = new URL(s.headers.location as string).searchParams.get('state')!;
    const cb = await api().get('/auth/google/callback').query({ error: 'access_denied', state });
    assert.equal(new URL(cb.headers.location as string).searchParams.get('error'), 'cancelled');
  });
  it('linking Google to an existing password account removes the old password and sessions', async () => {
    const victim = 'victim@example.com';
    const hijack = await register(victim, 'attacker-chosen-password'); // pre-registered by someone else
    google.identities['code-link'] = {
      sub: 'g-3',
      email: victim,
      emailVerified: true,
      name: 'Real Owner',
    };
    const back = await signInWith('code-link');
    assert.ok(back.searchParams.get('code'));

    const login = await api()
      .post('/auth/login')
      .send({ email: victim, password: 'attacker-chosen-password' });
    assert.equal(login.status, 401, 'the pre-registered password must stop working');
    assert.equal(
      (await api().post('/auth/refresh').send({ refreshToken: hijack.refreshToken })).status,
      401,
    );
  });
});
