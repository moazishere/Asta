import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, describe, it } from 'node:test';

import request from 'supertest';
import { WebSocket } from 'ws';

import { createApp } from '../src/app.js';
import { decodePolyline, haversineM } from '../src/lib/geo.js';
import { renderInvitePage } from '../src/lib/invitePage.js';
import { createHub } from '../src/realtime.js';
import { createTestApp, fakeGoogle, recordingPush, testConfig } from './helpers.js';

const { app, db, pg, events } = await createTestApp();
const api = () => request(app);

type Tokens = { accessToken: string; user: { id: string } };
type Person = Tokens & { username: string };
let counter = 0;
const bearer = (t: Tokens) => ({ Authorization: `Bearer ${t.accessToken}` });

async function newUser(name?: string): Promise<Person> {
  const n = ++counter;
  const username = name ?? `runner${n}`;
  const res = await api()
    .post('/auth/register')
    .send({ email: `friend${n}@example.com`, password: 'password123' });
  const t = res.body as Tokens;
  const patch = await api()
    .patch('/me/profile')
    .set(bearer(t))
    .send({ username, display_name: `Name ${username}`, weight_kg: 81, timezone: 'UTC' });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  return { ...t, username };
}

const send = (from: Person, to: Person) =>
  api().post('/friends/requests').set(bearer(from)).send({ username: to.username });
const overview = async (p: Person) => (await api().get('/friends').set(bearer(p))).body;
async function befriend(a: Person, b: Person) {
  const r = await send(a, b);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const acc = await api().post(`/friends/requests/${r.body.friendship_id}/accept`).set(bearer(b));
  assert.equal(acc.status, 204);
  return r.body.friendship_id as string;
}

const M = 111_195;
/** Uploads a run of `legs` x 10 m starting 10 minutes ago, going north from a spot unique to the user. */
async function uploadRun(p: Person, legs = 150) {
  const t0 = Date.now() - 600_000;
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
  return {
    id: res.body.id as string,
    distance_m: res.body.distance_m as number,
    start: points[0]!,
  };
}

describe('finding people', () => {
  it('finds someone by exact username, case-insensitively, and shows only safe fields', async () => {
    const a = await newUser();
    const b = await newUser('Findable_Sam'.toLowerCase());
    const res = await api()
      .get('/friends/lookup')
      .query({ username: 'FINDABLE_SAM' })
      .set(bearer(a));
    assert.equal(res.status, 200);
    assert.equal(res.body.user.id, b.user.id);
    assert.equal(res.body.relationship, 'none');
    assert.deepEqual(Object.keys(res.body.user).sort(), [
      'avatar_url',
      'display_name',
      'id',
      'username',
    ]);
  });

  it('does not match partial names, unknown names or myself', async () => {
    const a = await newUser();
    await newUser('someone_else');
    const lookup = (u: string) =>
      api().get('/friends/lookup').query({ username: u }).set(bearer(a));
    assert.equal((await lookup('someone')).status, 404);
    assert.equal((await lookup('nobody_here')).status, 404);
    assert.equal((await lookup(a.username)).status, 404);
    assert.equal((await lookup('bad name!')).status, 400);
    assert.equal(
      (await api().get('/friends/lookup').query({ username: 'someone_else' })).status,
      401,
    );
  });
});

describe('friend requests', () => {
  it('a request shows as outgoing for the sender, incoming for the receiver, and notifies both', async () => {
    const a = await newUser();
    const b = await newUser();
    events.length = 0;
    const res = await send(a, b);
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'pending');

    const mine = await overview(a);
    assert.equal(mine.outgoing.length, 1);
    assert.equal(mine.outgoing[0].user.username, b.username);
    assert.equal(mine.friends.length, 0);
    const theirs = await overview(b);
    assert.equal(theirs.incoming.length, 1);
    assert.equal(theirs.incoming[0].user.username, a.username);
    assert.equal(theirs.incoming[0].user.display_name, `Name ${a.username}`);

    const told = events
      .filter((e) => e.event.type === 'friends')
      .map((e) => e.userId)
      .sort();
    assert.deepEqual(told, [a.user.id, b.user.id].sort());

    const lookup = await api()
      .get('/friends/lookup')
      .query({ username: b.username })
      .set(bearer(a));
    assert.equal(lookup.body.relationship, 'outgoing');
  });

  it('rejects duplicates, existing friends and unknown users', async () => {
    const a = await newUser();
    const b = await newUser();
    await send(a, b);
    const dup = await send(a, b);
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error, 'already_requested');
    assert.equal(
      (await api().post('/friends/requests').set(bearer(a)).send({ username: 'ghost_user' }))
        .status,
      404,
    );
    assert.equal(
      (
        await api()
          .post('/friends/requests')
          .set(bearer(a))
          .send({ username: b.username, extra: 1 })
      ).status,
      400,
    );
    await api()
      .post(`/friends/requests/${(await overview(b)).incoming[0].friendship_id}/accept`)
      .set(bearer(b));
    const again = await send(a, b);
    assert.equal(again.status, 409);
    assert.equal(again.body.error, 'already_friends');
  });

  it('asking someone who already asked me accepts their request', async () => {
    const a = await newUser();
    const b = await newUser();
    await send(a, b);
    const back = await send(b, a);
    assert.equal(back.status, 201);
    assert.equal(back.body.status, 'accepted');
    assert.equal((await overview(a)).friends.length, 1);
    assert.equal((await overview(b)).friends.length, 1);
  });

  it('only the person asked can accept; the sender and strangers cannot', async () => {
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    const { body } = await send(a, b);
    const accept = (u: Person) =>
      api().post(`/friends/requests/${body.friendship_id}/accept`).set(bearer(u));
    assert.equal((await accept(a)).status, 404, 'sender cannot accept their own request');
    assert.equal((await accept(c)).status, 404, 'a stranger cannot');
    assert.equal((await overview(a)).friends.length, 0);
    assert.equal((await accept(b)).status, 204);
    assert.equal((await overview(a)).friends.length, 1);
    assert.equal((await accept(b)).status, 404, 'already accepted');
  });

  it('declining removes the request and the sender can ask again later', async () => {
    const a = await newUser();
    const b = await newUser();
    const { body } = await send(a, b);
    assert.equal(
      (await api().post(`/friends/requests/${body.friendship_id}/decline`).set(bearer(a))).status,
      404,
      'sender cannot decline',
    );
    assert.equal(
      (await api().post(`/friends/requests/${body.friendship_id}/decline`).set(bearer(b))).status,
      204,
    );
    assert.equal((await overview(b)).incoming.length, 0);
    assert.equal((await overview(a)).outgoing.length, 0);
    assert.equal((await send(a, b)).status, 201);
  });

  it('the sender can cancel; nobody else can', async () => {
    const a = await newUser();
    const b = await newUser();
    const { body } = await send(a, b);
    assert.equal(
      (await api().delete(`/friends/requests/${body.friendship_id}`).set(bearer(b))).status,
      404,
    );
    assert.equal(
      (await api().delete(`/friends/requests/${body.friendship_id}`).set(bearer(a))).status,
      204,
    );
    assert.equal((await overview(b)).incoming.length, 0);
  });

  it('caps pending requests at 50', async () => {
    const a = await newUser();
    for (let i = 0; i < 50; i++) {
      const id = randomUUID();
      await pg.query(`insert into users (id, email, password_hash) values ($1, $2, 'x')`, [
        id,
        `cap${counter}-${i}@example.com`,
      ]);
      await pg.query(
        `insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'pending')`,
        [a.user.id, id],
      );
    }
    const b = await newUser();
    const res = await send(a, b);
    assert.equal(res.status, 429);
  });
});

describe('removing friends and blocking', () => {
  it('either friend can remove the friendship, and the other is notified', async () => {
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    const friendshipId = await befriend(a, b);
    assert.equal(
      (await api().delete(`/friends/${friendshipId}`).set(bearer(c))).status,
      404,
      'a stranger cannot',
    );
    events.length = 0;
    assert.equal((await api().delete(`/friends/${friendshipId}`).set(bearer(b))).status, 204);
    assert.equal((await overview(a)).friends.length, 0);
    assert.equal((await overview(b)).friends.length, 0);
    assert.ok(events.some((e) => e.userId === a.user.id && e.event.type === 'friends'));
    assert.equal((await api().delete(`/friends/${friendshipId}`).set(bearer(b))).status, 404);
  });

  it('a block hides the blocker from the blocked person completely', async () => {
    const a = await newUser();
    const b = await newUser();
    await befriend(a, b);
    assert.equal(
      (await api().post('/friends/block').set(bearer(b)).send({ user_id: a.user.id })).status,
      204,
    );

    assert.equal((await overview(a)).friends.length, 0, 'the friendship is gone for both');
    const blocker = await overview(b);
    assert.equal(blocker.blocked.length, 1);
    assert.equal(blocker.blocked[0].user.username, a.username);
    assert.deepEqual((await overview(a)).blocked, [], 'the blocked person cannot see the block');

    assert.equal(
      (await api().get('/friends/lookup').query({ username: b.username }).set(bearer(a))).status,
      404,
    );
    assert.equal((await send(a, b)).status, 404, 'cannot send requests to someone who blocked me');
    assert.equal((await api().get(`/friends/${b.user.id}/profile`).set(bearer(a))).status, 404);
    assert.equal(
      (await api().delete(`/friends/block/${b.user.id}`).set(bearer(a))).status,
      404,
      'cannot unblock myself out of it',
    );
  });

  it('the blocker can unblock and then the two can find each other again', async () => {
    const a = await newUser();
    const b = await newUser();
    await api().post('/friends/block').set(bearer(b)).send({ user_id: a.user.id });
    const blocked = await send(b, a);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error, 'you_blocked_them');
    assert.equal((await api().delete(`/friends/block/${a.user.id}`).set(bearer(b))).status, 204);
    assert.equal(
      (await api().get('/friends/lookup').query({ username: b.username }).set(bearer(a))).status,
      200,
    );
    assert.equal((await send(a, b)).status, 201);
  });

  it('rejects blocking yourself or a user that does not exist', async () => {
    const a = await newUser();
    assert.equal(
      (await api().post('/friends/block').set(bearer(a)).send({ user_id: a.user.id })).status,
      400,
    );
    assert.equal(
      (await api().post('/friends/block').set(bearer(a)).send({ user_id: randomUUID() })).status,
      404,
    );
    assert.equal(
      (await api().post('/friends/block').set(bearer(a)).send({ user_id: 'nope' })).status,
      400,
    );
  });
});

describe('what friends can see', () => {
  it('the friends list shows this week’s distance from friends only', async () => {
    const a = await newUser();
    const b = await newUser();
    const stranger = await newUser();
    await befriend(a, b);
    const run = await uploadRun(a);
    await uploadRun(stranger, 300);
    const list = await overview(b);
    assert.equal(list.friends.length, 1);
    assert.equal(list.friends[0].week_distance_m, run.distance_m);
    assert.equal(list.friends[0].week_runs, 1);
    assert.equal((await overview(stranger)).friends.length, 0);
  });

  it('a friend’s profile has recent runs with ONLY the trimmed public route', async () => {
    const a = await newUser();
    const b = await newUser();
    await befriend(a, b);
    const run = await uploadRun(a, 200); // ~2 km

    const res = await api().get(`/friends/${a.user.id}/profile`).set(bearer(b));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.user.username, a.username);
    assert.equal(res.body.week_distance_m, run.distance_m);
    assert.equal(res.body.runs.length, 1);

    const shown = res.body.runs[0];
    assert.equal(shown.id, run.id);
    assert.ok(shown.route_polyline_public, 'friends get the trimmed route');
    for (const hidden of ['route_polyline', 'kcal_est', 'suspicious', 'points', 'user_id']) {
      assert.equal(hidden in shown, false, `${hidden} must not be exposed to friends`);
    }
    const pub = decodePolyline(shown.route_polyline_public);
    assert.ok(haversineM(pub[0]!, run.start) >= 195, 'the start of the run (home) is hidden');
    assert.ok(!JSON.stringify(res.body).includes('weight'), 'no body measurements');
    assert.ok(!JSON.stringify(res.body).includes('@example.com'), 'no email addresses');
  });

  it('a non-friend, a stranger and an ex-friend cannot read anyone’s runs or profile', async () => {
    const a = await newUser();
    const b = await newUser();
    const stranger = await newUser();
    const friendshipId = await befriend(a, b);
    await uploadRun(a);

    assert.equal(
      (await api().get(`/friends/${a.user.id}/profile`).set(bearer(stranger))).status,
      404,
    );
    assert.equal((await api().get(`/friends/${randomUUID()}/profile`).set(bearer(b))).status, 404);
    assert.equal(
      (await api().get(`/friends/${b.user.id}/profile`).set(bearer(b))).status,
      404,
      'own profile is not a friend profile',
    );
    assert.equal((await api().get(`/friends/${a.user.id}/profile`).set(bearer(b))).status, 200);

    await api().delete(`/friends/${friendshipId}`).set(bearer(a));
    assert.equal(
      (await api().get(`/friends/${a.user.id}/profile`).set(bearer(b))).status,
      404,
      'access ends with the friendship',
    );
    // The owner-only endpoints never expose another user's data, friend or not.
    const runs = (await api().get('/runs').set(bearer(b))).body;
    assert.deepEqual(runs.items, []);
  });

  it('nobody but the owner can read food logs, not even a friend', async () => {
    const a = await newUser();
    const b = await newUser();
    await befriend(a, b);
    await api().post('/food-logs').set(bearer(a)).send({
      custom_name: 'Private lunch',
      kcal: 800,
      meal_type: 'lunch',
      log_date: '2026-11-05',
    });
    const seen = await api().get('/food-logs').query({ date: '2026-11-05' }).set(bearer(b));
    assert.deepEqual(seen.body.entries, []);
    assert.equal(seen.body.totals.kcal, 0);
    assert.ok(
      !JSON.stringify(
        await api()
          .get(`/friends/${a.user.id}/profile`)
          .set(bearer(b))
          .then((r) => r.body),
      ).includes('Private lunch'),
    );
  });
});

describe('live updates (WebSocket)', () => {
  const servers: Server[] = [];
  const hubs: ReturnType<typeof createHub>[] = [];
  after(() => {
    for (const h of hubs) h.close();
    for (const s of servers) s.close();
  });

  function startServer() {
    const hub = createHub(testConfig);
    const server = createServer(
      createApp({
        db,
        config: testConfig,
        google: fakeGoogle().client,
        hub,
        push: recordingPush().sender,
      }),
    );
    hub.attach(server);
    server.listen(0);
    servers.push(server);
    hubs.push(hub);
    return { server, port: (server.address() as AddressInfo).port };
  }

  const open = (port: number) =>
    new Promise<WebSocket>((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}/ws`);
      ws.once('open', () => resolve(ws));
      ws.once('error', reject);
    });
  const next = (ws: WebSocket) =>
    new Promise<{ type: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for a message')), 4000);
      ws.once('message', (raw) => {
        clearTimeout(timer);
        resolve(JSON.parse(raw.toString()));
      });
    });

  it('pushes a friends event to the person who receives a request, live', async () => {
    const a = await newUser();
    const b = await newUser();
    const { server, port } = startServer();

    const ws = await open(port);
    const ready = next(ws);
    ws.send(JSON.stringify({ type: 'auth', token: b.accessToken }));
    assert.equal((await ready).type, 'ready');

    const pushed = next(ws);
    const res = await request(server)
      .post('/friends/requests')
      .set(bearer(a))
      .send({ username: b.username });
    assert.equal(res.status, 201);
    assert.deepEqual(await pushed, { type: 'friends' });
    ws.close();
  });

  it('does not deliver to other users, and rejects a bad token', async () => {
    const a = await newUser();
    const b = await newUser();
    const c = await newUser();
    const { server, port } = startServer();

    const stranger = await open(port);
    const strangerReady = next(stranger);
    stranger.send(JSON.stringify({ type: 'auth', token: c.accessToken }));
    await strangerReady;
    let received = 0;
    stranger.on('message', () => received++);
    await request(server).post('/friends/requests').set(bearer(a)).send({ username: b.username });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(received, 0, 'an unrelated user must not hear about it');
    stranger.close();

    const bad = await open(port);
    const rejection = next(bad);
    bad.send(JSON.stringify({ type: 'auth', token: 'not-a-token' }));
    assert.equal((await rejection).type, 'auth_error');
    await new Promise((resolve) => bad.once('close', resolve));
  });

  it('refuses connections on any other path', async () => {
    const { port } = startServer();
    await assert.rejects(
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:${port}/other`);
        ws.once('open', resolve);
        ws.once('error', reject);
      }),
    );
  });
});

describe('invite links', () => {
  it('serves a landing page with the app deep link and a strict CSP', async () => {
    const res = await api().get('/invite/Sara_Runs');
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type']!, /html/);
    assert.ok(res.text.includes('asta://invite/sara_runs'));
    assert.ok(res.text.includes('@sara_runs'));
    const csp = res.headers['content-security-policy']!;
    assert.match(csp, /default-src 'none'/);
    assert.ok(!csp.includes('unsafe-inline'));
    const nonce = /nonce-([A-Za-z0-9+/=]+)/.exec(csp)![1]!;
    assert.ok(res.text.includes(`nonce="${nonce}"`));
  });

  it('does not reveal whether a username exists and rejects malformed ones', async () => {
    assert.equal((await api().get('/invite/definitely_no_user')).status, 200);
    for (const bad of ['ab', 'a'.repeat(21), '%3Cscript%3E', 'has%20space']) {
      assert.equal((await api().get(`/invite/${bad}`)).status, 404, bad);
    }
  });

  it('escapes everything it prints and shows install links only when configured', () => {
    const page = renderInvitePage({
      username: '<img src=x onerror=alert(1)>',
      scheme: 'asta',
      nonce: 'n',
      appStoreUrl: 'https://apps.apple.com/app/x?a=1&b="2"',
    });
    assert.ok(!page.includes('<img src=x'));
    assert.ok(page.includes('&lt;img'));
    assert.ok(page.includes('apps.apple.com') && page.includes('&amp;b=&quot;2&quot;'));
    assert.ok(!page.includes('Google Play'));
    assert.ok(
      renderInvitePage({ username: 'sam', scheme: 'asta', nonce: 'n' }).includes('Ask your friend'),
    );
  });
});
