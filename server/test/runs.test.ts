import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import request from 'supertest';

import { decodePolyline, haversineM } from '../src/lib/geo.js';
import { createTestApp } from './helpers.js';

const { app, db, pg } = await createTestApp();
const api = () => request(app);

type Tokens = { accessToken: string; user: { id: string } };
let counter = 0;
async function newUser(weightKg?: number): Promise<Tokens> {
  const res = await api()
    .post('/auth/register')
    .send({ email: `runner${++counter}@example.com`, password: 'password123' });
  const t = res.body as Tokens;
  if (weightKg) {
    await api().patch('/me/profile').set(bearer(t)).send({ weight_kg: weightKg });
  }
  return t;
}
const bearer = (t: Tokens) => ({ Authorization: `Bearer ${t.accessToken}` });

const M_PER_DEG_LAT = 111_195;
const START = Date.parse('2026-11-05T06:00:00Z');
const START_LAT = 33.5;
const START_LNG = 36.3;

type P = { seq: number; t: number; lat: number; lng: number; acc?: number; seg?: number };
/** `count` points going north, `stepM` apart, one every `dtMs`. */
function track(
  count: number,
  stepM = 8,
  dtMs = 2667,
  seqStart = 0,
  t0 = START,
  latStart = START_LAT,
  seg = 0,
): P[] {
  return Array.from({ length: count }, (_, i) => ({
    seq: seqStart + i,
    t: t0 + i * dtMs,
    lat: latStart + (i * stepM) / M_PER_DEG_LAT,
    lng: START_LNG,
    acc: 5,
    seg,
  }));
}
function runBody(points: P[], overrides: Record<string, unknown> = {}) {
  const last = points[points.length - 1]!;
  return {
    id: randomUUID(),
    startedAt: new Date(START).toISOString(),
    endedAt: new Date(last.t).toISOString(),
    movingTimeS: Math.round((last.t - START) / 1000),
    points,
    ...overrides,
  };
}
const post = (t: Tokens, body: object) => api().post('/runs').set(bearer(t)).send(body);

describe('POST /runs', () => {
  it('derives distance, pace, calories and routes from the raw points', async () => {
    const t = await newUser(80);
    const pts = track(300); // 299 legs of 8 m = 2392 m
    const res = await post(t, runBody(pts));
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.ok(Math.abs(res.body.distance_m - 2392) < 25, String(res.body.distance_m));
    assert.equal(res.body.kcal_est, Math.round(80 * (res.body.distance_m / 1000)));
    // 2392 m in ~797 s is ~333 s/km
    assert.ok(Math.abs(res.body.avg_pace_s_per_km - 333) < 10, String(res.body.avg_pace_s_per_km));
    assert.equal(res.body.suspicious, false);

    const stored = await pg.query<{ route_polyline: string; route_polyline_public: string }>(
      `select route_polyline, route_polyline_public from runs where id = $1`,
      [res.body.id],
    );
    const full = decodePolyline(stored.rows[0]!.route_polyline);
    const pub = decodePolyline(stored.rows[0]!.route_polyline_public);
    assert.ok(full.length >= 2 && full.length < pts.length, 'route is simplified');
    assert.ok(haversineM(full[0]!, pts[0]!) < 1, 'full route starts at the real start');
    assert.ok(haversineM(pub[0]!, pts[0]!) >= 195, 'public route hides the first ~200 m');
    assert.ok(haversineM(pub[pub.length - 1]!, pts[pts.length - 1]!) >= 195, 'and the last ~200 m');
    const count = await pg.query<{ n: number }>(
      `select count(*)::int n from run_points where run_id = $1`,
      [res.body.id],
    );
    assert.equal(count.rows[0]!.n, 300);
  });

  it('uses a default body weight when the profile has none', async () => {
    const t = await newUser();
    const res = await post(t, runBody(track(300)));
    assert.equal(res.body.kcal_est, Math.round(70 * (res.body.distance_m / 1000)));
  });

  it('is idempotent: retrying the same upload returns the same run and adds nothing', async () => {
    const t = await newUser();
    const body = runBody(track(100));
    const first = await post(t, body);
    const again = await post(t, body);
    assert.equal(first.status, 201);
    assert.equal(again.status, 200);
    assert.deepEqual(again.body, first.body);
    const runs = await pg.query<{ n: number }>(`select count(*)::int n from runs where id = $1`, [
      body.id,
    ]);
    const pts = await pg.query<{ n: number }>(
      `select count(*)::int n from run_points where run_id = $1`,
      [body.id],
    );
    assert.equal(runs.rows[0]!.n, 1);
    assert.equal(pts.rows[0]!.n, 100);
  });

  it('refuses an id that belongs to another user and leaves their run untouched', async () => {
    const owner = await newUser();
    const thief = await newUser();
    const body = runBody(track(100));
    await post(owner, body);
    const res = await post(thief, { ...body, points: track(150) });
    assert.equal(res.status, 409);
    const row = await pg.query<{ user_id: string }>(`select user_id from runs where id = $1`, [
      body.id,
    ]);
    assert.equal(row.rows[0]!.user_id, owner.user.id);
  });

  it('ignores a GPS spike instead of adding it to the distance', async () => {
    const t = await newUser();
    const pts = track(200);
    pts[100] = { ...pts[100]!, lat: pts[100]!.lat + 0.05 }; // ~5.5 km jump for one fix
    const res = await post(t, runBody(pts));
    assert.equal(res.status, 201);
    assert.ok(res.body.distance_m < 1700, `spike was counted: ${res.body.distance_m}`);
  });

  it('drops low-accuracy fixes', async () => {
    const t = await newUser();
    const pts = track(200).map((p, i) => (i % 2 ? { ...p, acc: 100 } : p));
    const res = await post(t, runBody(pts));
    const n = await pg.query<{ n: number }>(
      `select count(*)::int n from run_points where run_id = $1`,
      [res.body.id],
    );
    assert.equal(n.rows[0]!.n, 100);
  });

  it('does not count the gap across a pause as distance', async () => {
    const t = await newUser();
    const first = track(100); // 792 m
    const second = track(100, 8, 2667, 100, START + 600_000, START_LAT + 0.1, 1); // resumes 11 km away
    const res = await post(t, runBody([...first, ...second]));
    assert.equal(res.status, 201);
    assert.ok(Math.abs(res.body.distance_m - 2 * 792) < 20, String(res.body.distance_m));
  });

  it('flags an average speed above 20 km/h as suspicious', async () => {
    const t = await newUser();
    const res = await post(t, runBody(track(200, 12, 2000))); // 6 m/s = 21.6 km/h
    assert.equal(res.status, 201);
    assert.equal(res.body.suspicious, true);
  });

  it('accepts a long run whose body is far larger than the default 100 KB limit', async () => {
    const t = await newUser();
    const res = await post(t, runBody(track(20_000, 6, 2000)));
    assert.equal(res.status, 201, JSON.stringify(res.body).slice(0, 200));
  });

  it('rejects bad input', async () => {
    const t = await newUser();
    const ok = runBody(track(50));
    assert.equal((await post(t, { ...ok, points: track(1) })).status, 400, 'needs 2+ points');
    assert.equal((await post(t, { ...ok, id: 'nope' })).status, 400, 'id must be a uuid');
    assert.equal(
      (await post(t, { ...ok, endedAt: '2020-01-01T00:00:00Z' })).status,
      400,
      'ended before start',
    );
    const badLat = track(50);
    badLat[3] = { ...badLat[3]!, lat: 123 };
    assert.equal((await post(t, runBody(badLat))).status, 400, 'latitude out of range');
    const dup = track(50);
    dup[5] = { ...dup[5]!, seq: 4 };
    assert.equal((await post(t, runBody(dup))).status, 400, 'duplicate seq');
  });

  it('rejects a track with no usable points with 422', async () => {
    const t = await newUser();
    const res = await post(t, runBody(track(50).map((p) => ({ ...p, acc: 500 }))));
    assert.equal(res.status, 422);
    assert.equal(res.body.error, 'no_valid_track');
  });

  it('requires authentication', async () => {
    assert.equal(
      (
        await api()
          .post('/runs')
          .send(runBody(track(10)))
      ).status,
      401,
    );
  });
});

describe('run privacy', () => {
  it('other users cannot read someone else’s runs or GPS points', async () => {
    const owner = await newUser();
    const other = await newUser();
    const res = await post(owner, runBody(track(100)));
    assert.equal(res.status, 201);
    const seen = await db.asUser(other.user.id, async (q) => ({
      runs: (await q.query(`select id from runs`)).rows.length,
      points: (await q.query(`select 1 from run_points`)).rows.length,
    }));
    assert.deepEqual(seen, { runs: 0, points: 0 });
  });
});
