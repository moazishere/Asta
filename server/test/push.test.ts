import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createApp } from '../src/app.js';
import { findOvertaken, type BoardSnapshot } from '../src/lib/rankWatch.js';
import { tickChallenges } from '../src/scheduler.js';
import { createTestApp, fakeGoogle, nullHubForTests, testConfig } from './helpers.js';

const { app, db, pg, hub, push } = await createTestApp();
const api = () => request(app);

type Person = { accessToken: string; user: { id: string }; username: string; deviceToken: string };
let counter = 0;
const bearer = (p: Person) => ({ Authorization: `Bearer ${p.accessToken}` });
const DAY = 24 * 3600 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function newUser(register = true): Promise<Person> {
  const n = ++counter;
  const username = `push${n}`;
  const res = await api()
    .post('/auth/register')
    .send({ email: `push${n}@example.com`, password: 'password123' });
  const p = {
    ...(res.body as Omit<Person, 'username' | 'deviceToken'>),
    username,
    deviceToken: `ExponentPushToken[device-${n}-xxxxxxxxxxxx]`,
  };
  await api()
    .patch('/me/profile')
    .set(bearer(p))
    .send({ username, display_name: `Name ${username}` });
  if (register)
    await api().put('/push/token').set(bearer(p)).send({ token: p.deviceToken, platform: 'ios' });
  return p;
}
const befriend = (a: Person, b: Person) =>
  pg.query(
    `insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`,
    [a.user.id, b.user.id],
  );
const sentTo = (p: Person) => push.messages.filter((m) => m.to === p.deviceToken);
const setting = (p: Person, body: object) =>
  api().patch('/push/settings').set(bearer(p)).send(body);

describe('device tokens', () => {
  it('registers a token, and rejects things that are not Expo push tokens', async () => {
    const p = await newUser(false);
    const put = (body: object) => api().put('/push/token').set(bearer(p)).send(body);
    assert.equal((await put({ token: p.deviceToken, platform: 'android' })).status, 204);
    assert.equal((await put({ token: 'not-a-token', platform: 'ios' })).status, 400);
    assert.equal((await put({ token: p.deviceToken, platform: 'windows' })).status, 400);
    assert.equal(
      (await put({ token: p.deviceToken, platform: 'ios', user_id: randomUUID() })).status,
      400,
    );
    assert.equal(
      (await api().put('/push/token').send({ token: p.deviceToken, platform: 'ios' })).status,
      401,
    );
    const rows = await pg.query(`select platform from push_tokens where token = $1`, [
      p.deviceToken,
    ]);
    assert.equal(rows.rows.length, 1);
    assert.equal(
      (rows.rows[0] as { platform: string }).platform,
      'android',
      're-registering updates in place',
    );
  });

  it('a token belongs to one account: signing in as someone else on the same phone moves it', async () => {
    const first = await newUser(false);
    const second = await newUser(false);
    const shared = 'ExponentPushToken[shared-phone-xxxxxxxxxx]';
    await api().put('/push/token').set(bearer(first)).send({ token: shared, platform: 'ios' });
    await api().put('/push/token').set(bearer(second)).send({ token: shared, platform: 'ios' });
    const owners = await pg.query<{ user_id: string }>(
      `select user_id from push_tokens where token = $1`,
      [shared],
    );
    assert.deepEqual(
      owners.rows.map((r) => r.user_id),
      [second.user.id],
    );
  });

  it('sign-out removes the token, but only the caller’s own', async () => {
    const a = await newUser();
    const b = await newUser();
    await api().delete('/push/token').set(bearer(b)).send({ token: a.deviceToken }); // trying to remove A's token
    assert.equal(
      (await pg.query(`select 1 from push_tokens where token = $1`, [a.deviceToken])).rows.length,
      1,
    );
    assert.equal(
      (await api().delete('/push/token').set(bearer(a)).send({ token: a.deviceToken })).status,
      204,
    );
    assert.equal(
      (await pg.query(`select 1 from push_tokens where token = $1`, [a.deviceToken])).rows.length,
      0,
    );
  });
});

describe('notification settings', () => {
  it('default to everything on, can be switched individually, and are per user', async () => {
    const a = await newUser();
    const b = await newUser();
    const defaults = {
      friend_requests: true,
      challenge_invites: true,
      leaderboard_passed: true,
      challenge_ended: true,
    };
    assert.deepEqual((await api().get('/push/settings').set(bearer(a))).body, defaults);
    const res = await setting(a, { leaderboard_passed: false });
    assert.deepEqual(res.body, { ...defaults, leaderboard_passed: false });
    assert.deepEqual((await api().get('/push/settings').set(bearer(a))).body, {
      ...defaults,
      leaderboard_passed: false,
    });
    assert.deepEqual((await setting(a, { friend_requests: false })).body, {
      ...defaults,
      leaderboard_passed: false,
      friend_requests: false,
    });
    assert.deepEqual(
      (await api().get('/push/settings').set(bearer(b))).body,
      defaults,
      'other users are unaffected',
    );
  });

  it('rejects unknown keys, non-booleans and empty bodies', async () => {
    const a = await newUser();
    assert.equal((await setting(a, { nonsense: true })).status, 400);
    assert.equal((await setting(a, { friend_requests: 'yes' })).status, 400);
    assert.equal((await setting(a, {})).status, 400);
    assert.equal((await api().get('/push/settings')).status, 401);
  });
});

describe('friend request notifications', () => {
  it('notifies only the person asked, with the sender’s name', async () => {
    const a = await newUser();
    const b = await newUser();
    push.messages.length = 0;
    const res = await api().post('/friends/requests').set(bearer(a)).send({ username: b.username });
    assert.equal(res.status, 201);
    assert.equal(sentTo(a).length, 0);
    assert.equal(sentTo(b).length, 1);
    assert.match(sentTo(b)[0]!.body, new RegExp(`Name ${a.username}`));
    assert.deepEqual(sentTo(b)[0]!.data, { type: 'friend_request' });
  });

  it('respects the switch, and an auto-accepted reply is not a "new request"', async () => {
    const a = await newUser();
    const b = await newUser();
    await setting(b, { friend_requests: false });
    push.messages.length = 0;
    await api().post('/friends/requests').set(bearer(a)).send({ username: b.username });
    assert.equal(sentTo(b).length, 0, 'switched off');
    push.messages.length = 0;
    await api().post('/friends/requests').set(bearer(b)).send({ username: a.username }); // b answers: auto-accept
    assert.equal(sentTo(a).length, 0);
  });

  it('a person with no registered device is simply skipped', async () => {
    const a = await newUser();
    const b = await newUser(false);
    push.messages.length = 0;
    assert.equal(
      (await api().post('/friends/requests').set(bearer(a)).send({ username: b.username })).status,
      201,
    );
    assert.equal(push.messages.length, 0);
  });
});

describe('challenge notifications', () => {
  const body = (invite: string[]) => ({
    title: 'Duel',
    type: 'distance',
    target_value: 20_000,
    starts_at: iso(DAY),
    ends_at: iso(8 * DAY),
    invite_user_ids: invite,
  });

  it('invites notify the invited friends, not the creator, and respect the switch', async () => {
    const creator = await newUser();
    const f1 = await newUser();
    const f2 = await newUser();
    await befriend(creator, f1);
    await befriend(creator, f2);
    await setting(f2, { challenge_invites: false });
    push.messages.length = 0;
    const res = await api()
      .post('/challenges')
      .set(bearer(creator))
      .send(body([f1.user.id, f2.user.id]));
    assert.equal(res.status, 201);
    assert.equal(sentTo(creator).length, 0);
    assert.equal(sentTo(f1).length, 1);
    assert.match(sentTo(f1)[0]!.body, /invited you to Duel/);
    assert.deepEqual(sentTo(f1)[0]!.data, { type: 'challenge', id: res.body.id });
    assert.equal(sentTo(f2).length, 0, 'switched off');

    // a later invite
    const f3 = await newUser();
    await befriend(creator, f3);
    push.messages.length = 0;
    await api()
      .post(`/challenges/${res.body.id}/invites`)
      .set(bearer(creator))
      .send({ user_ids: [f3.user.id, f1.user.id] });
    assert.equal(sentTo(f3).length, 1);
    assert.equal(sentTo(f1).length, 0, 'already invited: no second notification');
  });

  async function activeChallenge(members: Person[]) {
    const id = randomUUID();
    await pg.query(
      `insert into challenges (id, creator_id, title, type, target_value, starts_at, ends_at, status)
       values ($1, $2, 'Ending soon', 'distance', 20000, $3, $4, 'draft')`,
      [id, members[0]!.user.id, iso(-2 * DAY), iso(DAY)],
    );
    for (const m of members)
      await pg.query(
        `insert into challenge_members (challenge_id, user_id, status) values ($1, $2, 'joined')`,
        [id, m.user.id],
      );
    await pg.query(`update challenges set status = 'active' where id = $1`, [id]);
    await pg.query(`select recompute_challenge_scores($1)`, [id]);
    return id;
  }
  const run = (userId: string, distanceM: number) =>
    pg.query(
      `insert into runs (id, user_id, started_at, ended_at, distance_m, moving_time_s) values ($1, $2, $3, $4, $5, $6)`,
      [randomUUID(), userId, iso(-3600_000), iso(-1800_000), distanceM, Math.round(distanceM / 3)],
    );
  const endNow = (id: string) =>
    pg.query(`update challenges set ends_at = now() - interval '1 second' where id = $1`, [id]);

  it('when a challenge ends the winner hears they won and everyone else who did', async () => {
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    const id = await activeChallenge([a, b, c]);
    await run(b.user.id, 8000);
    await run(a.user.id, 2000);
    await endNow(id);
    push.messages.length = 0;
    await tickChallenges(db, hub, push.sender);
    assert.match(sentTo(b)[0]!.body, /You won/);
    assert.match(sentTo(a)[0]!.body, new RegExp(`Name ${b.username} won`));
    assert.match(sentTo(c)[0]!.body, new RegExp(`Name ${b.username} won`));
    assert.match(sentTo(a)[0]!.title, /Ending soon has ended/);
    assert.deepEqual(sentTo(a)[0]!.data, { type: 'challenge', id });
  });

  it('says so when nobody scored, respects the switch, and only fires once', async () => {
    const a = await newUser();
    const b = await newUser();
    await setting(b, { challenge_ended: false });
    const id = await activeChallenge([a, b]);
    await endNow(id);
    push.messages.length = 0;
    await tickChallenges(db, hub, push.sender);
    assert.match(sentTo(a)[0]!.body, /Nobody scored/);
    assert.equal(sentTo(b).length, 0);
    await tickChallenges(db, hub, push.sender);
    assert.equal(sentTo(a).length, 1, 'the second tick finds nothing to end');
  });

  describe('"a friend passed you"', () => {
    const M = 111_195;
    async function uploadRun(p: Person, legs: number) {
      const t0 = Date.now() - 2_000_000;
      const points = Array.from({ length: legs + 1 }, (_, i) => ({
        seq: i,
        t: t0 + i * 3333,
        lat: 33.5 + (i * 10) / M,
        lng: 36.3,
        acc: 5,
        seg: 0,
      }));
      const res = await api()
        .post('/runs')
        .set(bearer(p))
        .send({
          id: randomUUID(),
          startedAt: new Date(t0).toISOString(),
          endedAt: new Date(points[legs]!.t).toISOString(),
          points,
        });
      assert.equal(res.status, 201, JSON.stringify(res.body));
    }

    it('notifies exactly the members the runner overtook', async () => {
      const a = await newUser();
      const b = await newUser(); // far ahead
      const c = await newUser(); // slightly ahead
      const d = await newUser(); // behind
      await activeChallenge([a, b, c, d]).then(async (id) => {
        await run(b.user.id, 9000);
        await run(c.user.id, 1000);
        await run(d.user.id, 200);
        return id;
      });
      push.messages.length = 0;
      await uploadRun(a, 300); // 3 km: passes c (1 km) and d (200 m), not b (9 km)
      assert.equal(sentTo(c).length, 1);
      assert.equal(sentTo(d).length, 1);
      assert.equal(sentTo(b).length, 0, 'b stays ahead');
      assert.equal(sentTo(a).length, 0, 'the runner is not told about their own run');
      assert.match(sentTo(c)[0]!.title, new RegExp(`Name ${a.username} passed you`));
    });

    it('stays quiet when nobody is overtaken, when the switch is off, and for people already behind', async () => {
      const a = await newUser();
      const b = await newUser();
      const c = await newUser();
      await activeChallenge([a, b, c]).then(async () => {
        await run(b.user.id, 9000);
        await run(c.user.id, 4000);
      });
      await setting(c, { leaderboard_passed: false });
      push.messages.length = 0;
      await uploadRun(a, 100); // 1 km: still last
      assert.equal(push.messages.length, 0);
      await uploadRun(a, 500); // +5 km => 6 km: passes c (switched off) but not b
      assert.equal(sentTo(c).length, 0, 'switched off');
      assert.equal(sentTo(b).length, 0);
    });

    it('people in other challenges, or in none, are not notified', async () => {
      const a = await newUser();
      const b = await newUser();
      const outsider = await newUser();
      await activeChallenge([a, b]).then(() => run(b.user.id, 500));
      push.messages.length = 0;
      await uploadRun(a, 300);
      assert.equal(sentTo(b).length, 1);
      assert.equal(sentTo(outsider).length, 0);
    });
  });
});

describe('findOvertaken (pure)', () => {
  const board = (...order: string[]): BoardSnapshot => new Map([['c1', { title: 'T', order }]]);
  it('lists members the actor moved ahead of', () => {
    assert.deepEqual(
      findOvertaken(board('b', 'c', 'a'), board('b', 'a', 'c'), 'a').map((o) => o.userId),
      ['c'],
    );
    assert.deepEqual(
      findOvertaken(board('b', 'c', 'a'), board('a', 'b', 'c'), 'a')
        .map((o) => o.userId)
        .sort(),
      ['b', 'c'],
    );
  });
  it('ignores people who were already behind and the actor falling back', () => {
    assert.deepEqual(findOvertaken(board('a', 'b'), board('a', 'b'), 'a'), []);
    assert.deepEqual(
      findOvertaken(board('a', 'b'), board('b', 'a'), 'a'),
      [],
      'the actor was passed, nobody to tell',
    );
  });
  it('copes with new members and challenges that were not on the board before', () => {
    assert.deepEqual(findOvertaken(new Map(), board('a', 'b'), 'a'), []);
    assert.deepEqual(
      findOvertaken(board('b'), board('a', 'b'), 'a'),
      [],
      'the actor was not on the board before',
    );
    assert.deepEqual(
      findOvertaken(board('b', 'a'), board('a', 'b', 'x'), 'a').map((o) => o.userId),
      ['b'],
    );
  });
});

describe('push resilience', () => {
  it('removes tokens that Expo reports as dead', async () => {
    const a = await newUser();
    const b = await newUser();
    push.rejectTokens.add(b.deviceToken);
    await api().post('/friends/requests').set(bearer(a)).send({ username: b.username });
    assert.equal(
      (await pg.query(`select 1 from push_tokens where token = $1`, [b.deviceToken])).rows.length,
      0,
    );
    push.rejectTokens.delete(b.deviceToken);
  });

  it('a failing push service never fails the request that caused it', async () => {
    const a = await newUser();
    const b = await newUser();
    const broken = createApp({
      db,
      config: testConfig,
      google: fakeGoogle().client,
      hub: nullHubForTests,
      push: {
        send: async () => {
          throw new Error('Expo is down');
        },
      },
    });
    const res = await request(broken)
      .post('/friends/requests')
      .set(bearer(a))
      .send({ username: b.username });
    assert.equal(res.status, 201);
  });
});
