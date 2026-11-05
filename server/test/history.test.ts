import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import request from 'supertest';

import { createTestApp } from './helpers.js';

const { app, pg } = await createTestApp();
const api = () => request(app);

type Tokens = { accessToken: string; user: { id: string } };
let counter = 0;
const bearer = (t: Tokens) => ({ Authorization: `Bearer ${t.accessToken}` });

async function newUser(timezone?: string): Promise<Tokens> {
  const res = await api()
    .post('/auth/register')
    .send({ email: `hist${++counter}@example.com`, password: 'password123' });
  const t = res.body as Tokens;
  if (timezone) await api().patch('/me/profile').set(bearer(t)).send({ timezone });
  return t;
}

/** Inserts a run directly (as the database owner) so tests control timestamps and distances exactly. */
async function insertRun(userId: string, startedAt: string, distanceM = 5000, id = randomUUID()) {
  await pg.query(
    `insert into runs (id, user_id, started_at, ended_at, distance_m, moving_time_s, avg_pace_s_per_km, kcal_est, route_polyline)
     values ($1, $2, $3, $3::timestamptz + interval '30 minutes', $4, 1800, 360, 350, '_p~iF~ps|U_ulLnnqC')`,
    [id, userId, startedAt, distanceM],
  );
  return id;
}

describe('GET /runs (history)', () => {
  it('pages newest-first with no duplicates or gaps, including runs with the same start time', async () => {
    const t = await newUser();
    const ids: string[] = [];
    for (let i = 0; i < 25; i++) {
      // i % 20 repeats some start times on purpose: ties must still page correctly.
      ids.push(
        await insertRun(t.user.id, new Date(Date.UTC(2026, 9, 1 + (i % 20), 6)).toISOString()),
      );
    }
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: request.Response = await api()
        .get('/runs')
        .query({ limit: 10, ...(cursor ? { cursor } : {}) })
        .set(bearer(t));
      assert.equal(res.status, 200);
      assert.ok(res.body.items.length <= 10);
      seen.push(...res.body.items.map((r: { id: string }) => r.id));
      cursor = res.body.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    assert.equal(pages, 3);
    assert.equal(new Set(seen).size, 25, 'no duplicates');
    assert.deepEqual([...seen].sort(), [...ids].sort(), 'no gaps');
  });

  it('is ordered newest first and exposes the fields the list needs', async () => {
    const t = await newUser();
    await insertRun(t.user.id, '2026-10-01T06:00:00Z', 3000);
    await insertRun(t.user.id, '2026-10-03T06:00:00Z', 8000);
    const res = await api().get('/runs').set(bearer(t));
    assert.deepEqual(
      res.body.items.map((r: { distance_m: number }) => r.distance_m),
      [8000, 3000],
    );
    assert.equal(res.body.nextCursor, null);
    const run = res.body.items[0];
    for (const key of [
      'id',
      'started_at',
      'ended_at',
      'distance_m',
      'moving_time_s',
      'avg_pace_s_per_km',
      'kcal_est',
      'suspicious',
      'route_polyline',
    ]) {
      assert.ok(key in run, `missing ${key}`);
    }
    assert.equal('cursor_t' in run, false, 'internal cursor column must not leak');
    assert.equal(typeof run.distance_m, 'number');
  });

  it('returns an empty list for a new user and only ever my own runs', async () => {
    const me = await newUser();
    const other = await newUser();
    await insertRun(other.user.id, '2026-10-01T06:00:00Z');
    const res = await api().get('/runs').set(bearer(me));
    assert.deepEqual(res.body, { items: [], nextCursor: null });
  });

  it('rejects bad cursors and limits, and requires login', async () => {
    const t = await newUser();
    assert.equal(
      (await api().get('/runs').query({ cursor: 'garbage' }).set(bearer(t))).status,
      400,
    );
    assert.equal((await api().get('/runs').query({ limit: 500 }).set(bearer(t))).status, 400);
    assert.equal((await api().get('/runs')).status, 401);
  });
});

describe('GET /runs/:id and DELETE /runs/:id', () => {
  const M = 111_195;
  const T0 = Date.parse('2026-11-05T06:00:00Z');
  const track = (legs: number) =>
    Array.from({ length: legs + 1 }, (_, i) => ({
      seq: i,
      t: T0 + i * 3333,
      lat: 33.5 + (i * 10) / M,
      lng: 36.3,
      acc: 5,
      seg: 0,
    }));
  async function upload(t: Tokens, legs = 350) {
    const points = track(legs);
    const res = await api()
      .post('/runs')
      .set(bearer(t))
      .send({
        id: randomUUID(),
        startedAt: new Date(T0).toISOString(),
        endedAt: new Date(points[points.length - 1]!.t).toISOString(),
        points,
      });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body as { id: string; distance_m: number; moving_time_s: number };
  }

  it('returns the run with splits that agree with the run totals', async () => {
    const t = await newUser();
    const run = await upload(t);
    const res = await api().get(`/runs/${run.id}`).set(bearer(t));
    assert.equal(res.status, 200);
    assert.equal(res.body.distance_m, run.distance_m);
    assert.ok(res.body.route_polyline.length > 0);
    const splits = res.body.splits as { distance_m: number; duration_s: number }[];
    assert.equal(splits.length, 4);
    const dist = splits.reduce((s, x) => s + x.distance_m, 0);
    const secs = splits.reduce((s, x) => s + x.duration_s, 0);
    assert.ok(Math.abs(dist - run.distance_m) < 2, `${dist} vs ${run.distance_m}`);
    assert.ok(Math.abs(secs - run.moving_time_s) < 2, `${secs} vs ${run.moving_time_s}`);
  });

  it('measures moving time itself and ignores what the phone claims', async () => {
    const t = await newUser();
    const points = track(350);
    const res = await api()
      .post('/runs')
      .set(bearer(t))
      .send({
        id: randomUUID(),
        startedAt: new Date(T0).toISOString(),
        endedAt: new Date(points[350]!.t).toISOString(),
        movingTimeS: 60, // a lie: 3.5 km in one minute
        points,
      });
    assert.ok(Math.abs(res.body.moving_time_s - 1166) < 3, String(res.body.moving_time_s));
  });

  it('hides other users’ runs (404) and rejects malformed ids (400)', async () => {
    const owner = await newUser();
    const other = await newUser();
    const run = await upload(owner);
    assert.equal((await api().get(`/runs/${run.id}`).set(bearer(other))).status, 404);
    assert.equal((await api().get(`/runs/${randomUUID()}`).set(bearer(owner))).status, 404);
    assert.equal((await api().get('/runs/not-a-uuid').set(bearer(owner))).status, 400);
  });

  it('deletes my run and its GPS points, and nobody else can delete it', async () => {
    const owner = await newUser();
    const other = await newUser();
    const run = await upload(owner);
    assert.equal((await api().delete(`/runs/${run.id}`).set(bearer(other))).status, 404);
    assert.equal(
      (await api().get(`/runs/${run.id}`).set(bearer(owner))).status,
      200,
      'still there',
    );

    assert.equal((await api().delete(`/runs/${run.id}`).set(bearer(owner))).status, 204);
    assert.equal((await api().get(`/runs/${run.id}`).set(bearer(owner))).status, 404);
    const left = await pg.query<{ n: number }>(
      `select count(*)::int n from run_points where run_id = $1`,
      [run.id],
    );
    assert.equal(left.rows[0]!.n, 0);
    assert.equal(
      (await api().delete(`/runs/${run.id}`).set(bearer(owner))).status,
      404,
      'second delete',
    );
    assert.deepEqual((await api().get('/runs').set(bearer(owner))).body.items, []);
  });
});

describe('GET /stats/weekly', () => {
  it('cuts days in the user’s time zone, not UTC', async () => {
    const damascus = await newUser('Asia/Damascus'); // UTC+3
    const utc = await newUser('UTC');
    for (const u of [damascus, utc]) {
      await insertRun(u.user.id, '2026-11-01T22:30:00Z', 4000); // Sun 22:30 UTC = Mon 01:30 Damascus
      await insertRun(u.user.id, '2026-11-02T20:59:00Z', 1000); // Mon 23:59 Damascus
      await insertRun(u.user.id, '2026-11-02T21:00:00Z', 2000); // Tue 00:00 Damascus
      await insertRun(u.user.id, '2026-10-28T10:00:00Z', 7000); // previous week
    }
    const get = (u: Tokens) =>
      api().get('/stats/weekly').query({ week: '2026-11-04' }).set(bearer(u));

    const sy = (await get(damascus)).body;
    assert.equal(sy.weekStart, '2026-11-02');
    assert.deepEqual(
      sy.days.map((d: { distance_m: number }) => d.distance_m),
      [5000, 2000, 0, 0, 0, 0, 0],
    );
    assert.deepEqual(sy.thisWeek, { distance_m: 7000, runs: 3, moving_time_s: 5400 });
    assert.deepEqual(sy.lastWeek, { distance_m: 7000, runs: 1, moving_time_s: 1800 });

    const gm = (await get(utc)).body;
    // In UTC the first run is still Sunday, so it belongs to LAST week.
    assert.deepEqual(
      gm.days.map((d: { distance_m: number }) => d.distance_m),
      [3000, 0, 0, 0, 0, 0, 0], // both Monday-evening runs are still Monday in UTC
    );
    assert.deepEqual(gm.thisWeek, { distance_m: 3000, runs: 2, moving_time_s: 3600 });
    assert.deepEqual(gm.lastWeek, { distance_m: 11000, runs: 2, moving_time_s: 3600 });
  });

  it('weeks start on Monday for any date inside the week', async () => {
    const t = await newUser('UTC');
    for (const day of ['2026-11-02', '2026-11-05', '2026-11-08']) {
      const res = await api().get('/stats/weekly').query({ week: day }).set(bearer(t));
      assert.equal(res.body.weekStart, '2026-11-02', day);
    }
    const next = await api().get('/stats/weekly').query({ week: '2026-11-09' }).set(bearer(t));
    assert.equal(next.body.weekStart, '2026-11-09');
  });

  it('defaults to the current week and returns zeros with a seven-day series for a new user', async () => {
    const t = await newUser();
    const res = await api().get('/stats/weekly').set(bearer(t));
    assert.equal(res.status, 200);
    assert.equal(res.body.days.length, 7);
    assert.match(res.body.today, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(new Date(`${res.body.weekStart}T00:00:00Z`).getUTCDay(), 1, 'a Monday');
    assert.ok(res.body.days.map((d: { date: string }) => d.date).includes(res.body.today));
    assert.deepEqual(res.body.thisWeek, { distance_m: 0, runs: 0, moving_time_s: 0 });
  });

  it('only counts my own runs, validates the date and requires login', async () => {
    const me = await newUser('UTC');
    const other = await newUser('UTC');
    await insertRun(other.user.id, '2026-11-03T06:00:00Z', 9000);
    const res = await api().get('/stats/weekly').query({ week: '2026-11-03' }).set(bearer(me));
    assert.equal(res.body.thisWeek.distance_m, 0);
    const bad = await api().get('/stats/weekly').query({ week: '2026-13-40' }).set(bearer(me));
    assert.equal(bad.status, 400);
    assert.equal((await api().get('/stats/weekly')).status, 401);
  });
});
