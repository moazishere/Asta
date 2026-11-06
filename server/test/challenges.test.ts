import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';

import request from 'supertest';

import { validateChallenge } from '../src/lib/challengeRules.js';
import { tickChallenges } from '../src/scheduler.js';
import { createTestApp } from './helpers.js';

const { app, db, pg, events, hub } = await createTestApp();
const api = () => request(app);

type Person = { accessToken: string; user: { id: string }; username: string };
let counter = 0;
const bearer = (p: Person) => ({ Authorization: `Bearer ${p.accessToken}` });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const DAY = 24 * 3600 * 1000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function newUser(opts: { timezone?: string; goal?: number } = {}): Promise<Person> {
  const n = ++counter;
  const username = `chal${n}`;
  const res = await api()
    .post('/auth/register')
    .send({ email: `chal${n}@example.com`, password: 'password123' });
  const p = { ...(res.body as Omit<Person, 'username'>), username };
  const patch = await api()
    .patch('/me/profile')
    .set(bearer(p))
    .send({
      username,
      display_name: `Name ${username}`,
      timezone: opts.timezone ?? 'UTC',
      ...(opts.goal ? { daily_kcal_goal: opts.goal } : {}),
    });
  assert.equal(patch.status, 200, JSON.stringify(patch.body));
  return p;
}
const befriend = (a: Person, b: Person) =>
  pg.query(
    `insert into friendships (requester_id, addressee_id, status) values ($1, $2, 'accepted')`,
    [a.user.id, b.user.id],
  );

type ChallengeType = 'distance' | 'run_count' | 'kcal_streak';

/** Builds a challenge directly in the database (as the owner) so tests control status and time exactly. */
async function makeChallenge(o: {
  creator: Person;
  members?: Person[];
  type: ChallengeType;
  start: string;
  end: string;
  status?: 'draft' | 'active' | 'ended';
  target?: number;
}) {
  const id = randomUUID();
  await pg.query(
    `insert into challenges (id, creator_id, title, type, target_value, starts_at, ends_at, status)
     values ($1, $2, 'Test challenge', $3, $4, $5, $6, 'draft')`,
    [id, o.creator.user.id, o.type, o.target ?? 100, o.start, o.end],
  );
  for (const m of [o.creator, ...(o.members ?? [])]) {
    await pg.query(
      `insert into challenge_members (challenge_id, user_id, status) values ($1, $2, 'joined')`,
      [id, m.user.id],
    );
  }
  // Moving to active AFTER the members exist, like the scheduler does: it scores everyone at 0.
  if (o.status && o.status !== 'draft')
    await pg.query(`update challenges set status = $2 where id = $1`, [id, o.status]);
  if (o.status === 'active') await pg.query(`select recompute_challenge_scores($1)`, [id]);
  return id;
}

async function insertRun(
  userId: string,
  startedAt: string,
  distanceM: number,
  movingS = Math.round(distanceM / 3),
) {
  const id = randomUUID();
  await pg.query(
    `insert into runs (id, user_id, started_at, ended_at, distance_m, moving_time_s)
     values ($1, $2, $3, $3::timestamptz + interval '1 hour', $4, $5)`,
    [id, userId, startedAt, distanceM, movingS],
  );
  return id;
}
async function logKcal(userId: string, date: string, kcal: number) {
  await pg.query(
    `insert into food_logs (user_id, log_date, meal_type, custom_name, kcal) values ($1, $2, 'lunch', 'x', $3)`,
    [userId, date, kcal],
  );
}
async function board(cid: string) {
  const r = await pg.query<{ user_id: string; value: number; reached_at: Date; updated_at: Date }>(
    `select user_id, value::float8 as value, reached_at, updated_at from challenge_scores where challenge_id = $1`,
    [cid],
  );
  return new Map(r.rows.map((x) => [x.user_id, x]));
}
const valueOf = async (cid: string, p: Person) => (await board(cid)).get(p.user.id)?.value;

describe('scoring: distance', () => {
  it('counts non-suspicious runs that START inside [starts_at, ends_at), in metres', async () => {
    const a = await newUser();
    const outsider = await newUser();
    const cid = await makeChallenge({
      creator: a,
      type: 'distance',
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-08T00:00:00Z',
      status: 'active',
    });
    await insertRun(a.user.id, '2026-09-30T23:59:59Z', 7000); // before
    await insertRun(a.user.id, '2026-10-01T00:00:00Z', 5000); // exactly at the start: counts
    await insertRun(a.user.id, '2026-10-07T23:59:59Z', 3000); // last second: counts
    await insertRun(a.user.id, '2026-10-08T00:00:00Z', 4000); // exactly at the end: does not
    await insertRun(a.user.id, '2026-10-03T08:00:00Z', 9000, 1200); // 27 km/h: flagged suspicious, never counts
    await insertRun(outsider.user.id, '2026-10-03T08:00:00Z', 6000);
    assert.equal(await valueOf(cid, a), 8000);
    assert.equal(await valueOf(cid, outsider), undefined, 'non-members get no score');
  });

  it('deleting a run lowers the score', async () => {
    const a = await newUser();
    const cid = await makeChallenge({
      creator: a,
      type: 'distance',
      start: iso(-DAY),
      end: iso(DAY),
      status: 'active',
    });
    const keep = await insertRun(a.user.id, iso(-3600_000), 4000);
    const drop = await insertRun(a.user.id, iso(-7200_000), 2500);
    assert.equal(await valueOf(cid, a), 6500);
    await pg.query(`delete from runs where id = $1`, [drop]);
    assert.equal(await valueOf(cid, a), 4000);
    await pg.query(`delete from runs where id = $1`, [keep]);
    assert.equal(await valueOf(cid, a), 0);
  });

  it('updating a run (e.g. flagged suspicious) is reflected', async () => {
    const a = await newUser();
    const cid = await makeChallenge({
      creator: a,
      type: 'distance',
      start: iso(-DAY),
      end: iso(DAY),
      status: 'active',
    });
    const run = await insertRun(a.user.id, iso(-3600_000), 4000);
    assert.equal(await valueOf(cid, a), 4000);
    await pg.query(`update runs set suspicious = true where id = $1`, [run]);
    assert.equal(await valueOf(cid, a), 0);
  });
});

describe('scoring: run_count', () => {
  it('counts runs of at least 1 km only, and never suspicious ones', async () => {
    const a = await newUser();
    const cid = await makeChallenge({
      creator: a,
      type: 'run_count',
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-08T00:00:00Z',
      status: 'active',
    });
    await insertRun(a.user.id, '2026-10-02T08:00:00Z', 1500);
    await insertRun(a.user.id, '2026-10-03T08:00:00Z', 1000); // exactly 1 km counts
    await insertRun(a.user.id, '2026-10-04T08:00:00Z', 999); // just short
    await insertRun(a.user.id, '2026-10-05T08:00:00Z', 5000, 200); // suspicious
    await insertRun(a.user.id, '2026-09-20T08:00:00Z', 5000); // outside the window
    assert.equal(await valueOf(cid, a), 2);
  });
});

describe('scoring: kcal_streak (days within +/-10% of the goal)', () => {
  it('uses the member’s own time zone for the window and counts only qualifying days', async () => {
    // Damascus is UTC+3. This window is local days Oct 2..Oct 6 (it starts at 21:00 UTC on Oct 1).
    const a = await newUser({ timezone: 'Asia/Damascus', goal: 2000 });
    const cid = await makeChallenge({
      creator: a,
      type: 'kcal_streak',
      start: '2026-10-01T21:00:00Z',
      end: '2026-10-06T21:00:00Z',
      status: 'ended',
    });
    await logKcal(a.user.id, '2026-10-01', 2000); // the day before the window in Damascus
    await logKcal(a.user.id, '2026-10-02', 2000); // exactly on goal
    await logKcal(a.user.id, '2026-10-03', 2200); // exactly +10%: counts
    await logKcal(a.user.id, '2026-10-04', 2201); // just over
    await logKcal(a.user.id, '2026-10-05', 1800); // exactly -10%: counts
    await logKcal(a.user.id, '2026-10-06', 1000);
    await logKcal(a.user.id, '2026-10-06', 1000); // two entries summing to the goal: counts
    await logKcal(a.user.id, '2026-10-07', 2000); // after the window
    await pg.query(`select recompute_challenge_scores($1)`, [cid]);
    assert.equal(await valueOf(cid, a), 4);
  });

  it('the same data in UTC shifts the window by a day', async () => {
    const a = await newUser({ timezone: 'UTC', goal: 2000 });
    const cid = await makeChallenge({
      creator: a,
      type: 'kcal_streak',
      start: '2026-10-01T21:00:00Z',
      end: '2026-10-06T21:00:00Z',
      status: 'ended',
    });
    await logKcal(a.user.id, '2026-10-01', 2000); // window starts Oct 1 in UTC: counts
    await logKcal(a.user.id, '2026-10-02', 2000);
    await logKcal(a.user.id, '2026-10-07', 2000); // outside
    await pg.query(`select recompute_challenge_scores($1)`, [cid]);
    assert.equal(await valueOf(cid, a), 2);
  });

  it('a day with no entries never counts, and no goal means no score', async () => {
    const a = await newUser({ goal: 2000 });
    const nogoal = await newUser();
    const cid = await makeChallenge({
      creator: a,
      members: [nogoal],
      type: 'kcal_streak',
      start: '2026-10-01T00:00:00Z',
      end: '2026-10-04T00:00:00Z',
      status: 'ended',
    });
    await logKcal(nogoal.user.id, '2026-10-02', 2000);
    await pg.query(`select recompute_challenge_scores($1)`, [cid]);
    assert.equal(await valueOf(cid, a), 0);
    assert.equal(await valueOf(cid, nogoal), 0);
  });

  it('while active only COMPLETED days count, and changing the goal rescores', async () => {
    const a = await newUser({ goal: 2000 });
    const cid = await makeChallenge({
      creator: a,
      type: 'kcal_streak',
      start: iso(-3 * DAY),
      end: iso(3 * DAY),
      status: 'active',
    });
    const day = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10); // UTC dates
    await logKcal(a.user.id, day(-1), 2000); // yesterday: complete
    await logKcal(a.user.id, day(0), 2000); // today: still in progress, does not count yet
    assert.equal(await valueOf(cid, a), 1);
    await api().patch('/me/profile').set(bearer(a)).send({ daily_kcal_goal: 2400 }); // now yesterday is 17% off
    assert.equal(await valueOf(cid, a), 0);
    await api().patch('/me/profile').set(bearer(a)).send({ daily_kcal_goal: 2000 });
    assert.equal(await valueOf(cid, a), 1);
  });
});

describe('triggers: only active challenges, and reached_at', () => {
  it('draft and ended challenges are not touched by new runs', async () => {
    const a = await newUser();
    const active = await makeChallenge({
      creator: a,
      type: 'distance',
      start: iso(-DAY),
      end: iso(DAY),
      status: 'active',
    });
    const draft = await makeChallenge({
      creator: a,
      type: 'distance',
      start: iso(DAY),
      end: iso(3 * DAY),
    });
    const ended = await makeChallenge({
      creator: a,
      type: 'distance',
      start: iso(-3 * DAY),
      end: iso(-2 * DAY),
      status: 'ended',
    });
    await insertRun(a.user.id, iso(-3600_000), 5000);
    assert.equal(await valueOf(active, a), 5000);
    assert.equal(await valueOf(draft, a), undefined);
    assert.equal((await valueOf(ended, a)) ?? 0, 0);
  });

  it('reached_at moves only when the value changes; an identical recompute changes nothing', async () => {
    const a = await newUser();
    const cid = await makeChallenge({
      creator: a,
      type: 'distance',
      start: iso(-DAY),
      end: iso(DAY),
      status: 'active',
    });
    await insertRun(a.user.id, iso(-3600_000), 3000);
    const first = (await board(cid)).get(a.user.id)!;
    await sleep(20);
    await pg.query(`select recompute_challenge_scores($1)`, [cid]);
    await pg.query(`select recompute_challenge_scores($1)`, [cid]);
    const same = (await board(cid)).get(a.user.id)!;
    assert.equal(same.reached_at.getTime(), first.reached_at.getTime());
    assert.equal(same.updated_at.getTime(), first.updated_at.getTime());

    await sleep(20);
    await insertRun(a.user.id, iso(-1800_000), 1000);
    const changed = (await board(cid)).get(a.user.id)!;
    assert.equal(changed.value, 4000);
    assert.ok(changed.reached_at.getTime() > first.reached_at.getTime());
  });

  it('ties go to whoever reached the value first, and a recompute never reshuffles them', async () => {
    const a = await newUser();
    const b = await newUser();
    const cid = await makeChallenge({
      creator: a,
      members: [b],
      type: 'distance',
      start: iso(-DAY),
      end: iso(DAY),
      status: 'active',
    });
    await insertRun(b.user.id, iso(-7200_000), 5000); // Bob gets to 5000 first
    await sleep(20);
    await insertRun(a.user.id, iso(-3600_000), 5000); // Alice reaches the same value later
    const order = async () =>
      (await api().get(`/challenges/${cid}`).set(bearer(a))).body.leaderboard.map(
        (r: { user: { id: string } }) => r.user.id,
      );
    assert.deepEqual(await order(), [b.user.id, a.user.id]);
    await pg.query(`select recompute_challenge_scores($1)`, [cid]);
    await pg.query(`select recompute_challenge_scores($1)`, [cid]);
    assert.deepEqual(await order(), [b.user.id, a.user.id], 'recompute preserved reached_at');
    await sleep(20);
    await insertRun(a.user.id, iso(-1800_000), 1000); // Alice pulls ahead
    assert.deepEqual(await order(), [a.user.id, b.user.id]);
  });
});

describe('late joiners and leaving', () => {
  it('a member who joins an active challenge is scored straight away; leaving removes them', async () => {
    const creator = await newUser();
    const late = await newUser();
    await befriend(creator, late);
    const cid = await makeChallenge({
      creator,
      type: 'distance',
      start: iso(-2 * DAY),
      end: iso(2 * DAY),
      status: 'active',
    });
    await insertRun(late.user.id, iso(-DAY), 7000); // run inside the window, before joining

    const invite = await api()
      .post(`/challenges/${cid}/invites`)
      .set(bearer(creator))
      .send({ user_ids: [late.user.id] });
    assert.equal(invite.body.invited, 1);
    assert.equal(await valueOf(cid, late), undefined, 'invited people are not on the board yet');

    assert.equal((await api().post(`/challenges/${cid}/join`).set(bearer(late))).status, 204);
    assert.equal(await valueOf(cid, late), 7000, 'earlier runs inside the window count');

    assert.equal((await api().post(`/challenges/${cid}/leave`).set(bearer(late))).status, 204);
    assert.equal(await valueOf(cid, late), undefined);
    assert.equal(
      (await api().get(`/challenges/${cid}`).set(bearer(late))).status,
      404,
      'cannot come back',
    );
  });
});

describe('scheduler', () => {
  it('starts challenges at their start time, scoring everyone at zero', async () => {
    const a = await newUser();
    const b = await newUser();
    const cid = await makeChallenge({
      creator: a,
      members: [b],
      type: 'distance',
      start: iso(-1000),
      end: iso(DAY),
    });
    await insertRun(a.user.id, iso(-500), 2000); // already inside the window while still a draft
    assert.equal((await board(cid)).size, 0);

    events.length = 0;
    const changes = await tickChallenges(db, hub);
    assert.ok(changes.some((c) => c.challenge_id === cid && c.change === 'activated'));
    assert.equal(
      (await pg.query<{ status: string }>(`select status from challenges where id = $1`, [cid]))
        .rows[0]!.status,
      'active',
    );
    assert.equal(await valueOf(cid, a), 2000, 'the activation recompute picks up earlier runs');
    assert.equal(await valueOf(cid, b), 0);
    assert.ok(
      events.some((e) => e.userId === b.user.id && e.event.type === 'challenges'),
      'members are told',
    );
    assert.deepEqual(
      await tickChallenges(db, hub).then((c) => c.filter((x) => x.challenge_id === cid)),
      [],
      'idempotent',
    );
  });

  it('ends challenges at their end time and records the winner (ties: earliest reached_at)', async () => {
    const a = await newUser();
    const b = await newUser();
    const cid = await makeChallenge({
      creator: a,
      members: [b],
      type: 'distance',
      start: iso(-DAY),
      end: iso(DAY),
      status: 'active',
    });
    await insertRun(b.user.id, iso(-7200_000), 5000);
    await sleep(20);
    await insertRun(a.user.id, iso(-3600_000), 5000);
    await pg.query(`update challenges set ends_at = now() - interval '1 second' where id = $1`, [
      cid,
    ]);

    const changes = await tickChallenges(db, hub);
    assert.ok(changes.some((c) => c.challenge_id === cid && c.change === 'ended'));
    const row = (
      await pg.query<{ status: string; winner_id: string }>(
        `select status, winner_id from challenges where id = $1`,
        [cid],
      )
    ).rows[0]!;
    assert.equal(row.status, 'ended');
    assert.equal(row.winner_id, b.user.id, 'Bob reached 5000 first');

    await insertRun(a.user.id, iso(-1000), 9000); // too late: the board is frozen
    assert.equal(await valueOf(cid, a), 5000);
    const detail = (await api().get(`/challenges/${cid}`).set(bearer(a))).body;
    assert.equal(detail.winner.user.id, b.user.id);
  });

  it('has no winner when nobody scored', async () => {
    const a = await newUser();
    const cid = await makeChallenge({
      creator: a,
      type: 'distance',
      start: iso(-DAY),
      end: iso(DAY),
      status: 'active',
    });
    await pg.query(`update challenges set ends_at = now() - interval '1 second' where id = $1`, [
      cid,
    ]);
    await tickChallenges(db, hub);
    const row = (
      await pg.query<{ winner_id: string | null }>(
        `select winner_id from challenges where id = $1`,
        [cid],
      )
    ).rows[0]!;
    assert.equal(row.winner_id, null);
  });

  it('a calorie challenge counts the final day once it ends', async () => {
    const a = await newUser({ goal: 2000 });
    const cid = await makeChallenge({
      creator: a,
      type: 'kcal_streak',
      start: iso(-2 * DAY),
      end: iso(DAY),
      status: 'active',
    });
    const today = new Date().toISOString().slice(0, 10);
    await logKcal(a.user.id, today, 2000);
    assert.equal(await valueOf(cid, a), 0, 'today is incomplete while the challenge runs');
    await pg.query(`update challenges set ends_at = now() - interval '1 second' where id = $1`, [
      cid,
    ]);
    await tickChallenges(db, hub);
    assert.equal(await valueOf(cid, a), 1, 'after the end every logged day counts');
  });
});

describe('API: creating and managing challenges', () => {
  const body = (over: object = {}) => ({
    title: 'Weekend warriors',
    type: 'distance',
    target_value: 50_000,
    starts_at: iso(DAY),
    ends_at: iso(8 * DAY),
    invite_user_ids: [] as string[],
    ...over,
  });
  const create = (p: Person, b: object) => api().post('/challenges').set(bearer(p)).send(b);

  it('rejects invalid definitions', async () => {
    const a = await newUser();
    const bad = async (over: object) =>
      assert.equal((await create(a, body(over))).status, 400, JSON.stringify(over));
    await bad({ title: '' });
    await bad({ target_value: 500 }); // under 1 km
    await bad({ starts_at: iso(-2 * DAY), ends_at: iso(DAY) }); // starts in the past
    await bad({ starts_at: iso(DAY), ends_at: iso(DAY + 30 * 60_000) }); // shorter than an hour
    await bad({ starts_at: iso(DAY), ends_at: iso(100 * DAY) }); // longer than 90 days
    await bad({ type: 'run_count', target_value: 2.5 });
    await bad({ type: 'kcal_streak', target_value: 30 }); // more days than the window has
    await bad({ type: 'swimming' });
    await bad({ status: 'active' }); // unknown field
    await bad({ ends_at: iso(0) });
  });

  it('creates a challenge, makes me the first member and invites only friends', async () => {
    const creator = await newUser();
    const friend = await newUser();
    const stranger = await newUser();
    await befriend(creator, friend);
    const res = await create(
      creator,
      body({ invite_user_ids: [friend.user.id, stranger.user.id] }),
    );
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.status, 'draft');
    assert.equal(res.body.invited, 1);
    assert.deepEqual(res.body.rejected, [stranger.user.id]);

    const mine = (await api().get('/challenges').set(bearer(creator))).body.challenges;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].my_status, 'joined');
    const theirs = (await api().get('/challenges').set(bearer(friend))).body.challenges;
    assert.equal(theirs[0].my_status, 'invited');
    assert.equal(theirs[0].creator.username, creator.username);
    assert.deepEqual((await api().get('/challenges').set(bearer(stranger))).body.challenges, []);
    assert.equal((await api().get(`/challenges/${res.body.id}`).set(bearer(stranger))).status, 404);
  });

  it('a challenge that starts now becomes active immediately', async () => {
    const a = await newUser();
    const res = await create(a, body({ starts_at: iso(0), ends_at: iso(2 * DAY) }));
    assert.equal(res.status, 201);
    assert.equal(res.body.status, 'active');
  });

  it('invited people see the challenge but not the standings; members see names and values', async () => {
    const creator = await newUser();
    const friend = await newUser();
    await befriend(creator, friend);
    const { body: created } = await create(
      creator,
      body({ starts_at: iso(0), ends_at: iso(2 * DAY), invite_user_ids: [friend.user.id] }),
    );
    const asInvitee = (await api().get(`/challenges/${created.id}`).set(bearer(friend))).body;
    assert.equal(asInvitee.my_status, 'invited');
    assert.deepEqual(asInvitee.leaderboard, []);
    assert.equal(asInvitee.title, 'Weekend warriors');

    assert.equal(
      (await api().post(`/challenges/${created.id}/join`).set(bearer(friend))).status,
      204,
    );
    const asMember = (await api().get(`/challenges/${created.id}`).set(bearer(friend))).body;
    assert.equal(asMember.leaderboard.length, 2);
    assert.equal(asMember.leaderboard[0].user.display_name?.startsWith('Name '), true);
    assert.equal(asMember.member_count, 2);
    assert.equal(asMember.is_creator, false);
  });

  it('decline, double-join and leave rules', async () => {
    const creator = await newUser();
    const f1 = await newUser();
    const f2 = await newUser();
    await befriend(creator, f1);
    await befriend(creator, f2);
    const { body: c } = await create(
      creator,
      body({ starts_at: iso(0), ends_at: iso(2 * DAY), invite_user_ids: [f1.user.id, f2.user.id] }),
    );
    assert.equal((await api().post(`/challenges/${c.id}/decline`).set(bearer(f1))).status, 204);
    assert.equal(
      (await api().get(`/challenges/${c.id}`).set(bearer(f1))).status,
      404,
      'declined: gone for good',
    );
    assert.equal((await api().post(`/challenges/${c.id}/join`).set(bearer(f1))).status, 404);
    assert.equal((await api().post(`/challenges/${c.id}/join`).set(bearer(f2))).status, 204);
    assert.equal(
      (await api().post(`/challenges/${c.id}/join`).set(bearer(f2))).status,
      204,
      'joining twice is harmless',
    );
    assert.equal(
      (await api().post(`/challenges/${c.id}/decline`).set(bearer(f2))).status,
      409,
      'cannot decline after joining',
    );
    assert.equal(
      (await api().post(`/challenges/${c.id}/leave`).set(bearer(creator))).status,
      400,
      'the creator cannot leave',
    );
    assert.equal(
      (
        await api()
          .post(`/challenges/${c.id}/leave`)
          .set(bearer(await newUser()))
      ).status,
      404,
    );
  });

  it('nobody can join a challenge that has ended', async () => {
    const creator = await newUser();
    const f = await newUser();
    await befriend(creator, f);
    const cid = await makeChallenge({
      creator,
      type: 'distance',
      start: iso(-3 * DAY),
      end: iso(-2 * DAY),
      status: 'ended',
    });
    await pg.query(
      `insert into challenge_members (challenge_id, user_id, status) values ($1, $2, 'invited')`,
      [cid, f.user.id],
    );
    const res = await api().post(`/challenges/${cid}/join`).set(bearer(f));
    assert.equal(res.status, 409);
    assert.equal(res.body.error, 'challenge_ended');
  });

  it('only the creator can edit, only before the start, and only the creator can delete a draft', async () => {
    const creator = await newUser();
    const friend = await newUser();
    await befriend(creator, friend);
    const { body: c } = await create(creator, body({ invite_user_ids: [friend.user.id] }));

    assert.equal(
      (await api().patch(`/challenges/${c.id}`).set(bearer(friend)).send({ title: 'Hijack' }))
        .status,
      403,
    );
    assert.equal((await api().delete(`/challenges/${c.id}`).set(bearer(friend))).status, 403);
    assert.equal(
      (
        await api()
          .patch(`/challenges/${c.id}`)
          .set(bearer(creator))
          .send({ title: 'Renamed', target_value: 60_000 })
      ).status,
      204,
    );
    const after = (await api().get(`/challenges/${c.id}`).set(bearer(creator))).body;
    assert.equal(after.title, 'Renamed');
    assert.equal(after.target_value, 60_000);
    assert.equal(
      (await api().patch(`/challenges/${c.id}`).set(bearer(creator)).send({ target_value: 5 }))
        .status,
      400,
      'edits are validated too',
    );
    assert.equal(
      (await api().patch(`/challenges/${c.id}`).set(bearer(creator)).send({ type: 'run_count' }))
        .status,
      400,
      'the type cannot change',
    );

    assert.equal((await api().delete(`/challenges/${c.id}`).set(bearer(creator))).status, 204);
    assert.equal((await api().get(`/challenges/${c.id}`).set(bearer(creator))).status, 404);
  });

  it('a started challenge can be neither edited nor deleted', async () => {
    const creator = await newUser();
    const { body: c } = await create(creator, body({ starts_at: iso(0), ends_at: iso(2 * DAY) }));
    assert.equal(c.status, 'active');
    assert.equal(
      (await api().patch(`/challenges/${c.id}`).set(bearer(creator)).send({ title: 'Late' }))
        .status,
      409,
    );
    assert.equal((await api().delete(`/challenges/${c.id}`).set(bearer(creator))).status, 409);
  });

  it('the creator can invite more friends later; non-creators and non-friends cannot', async () => {
    const creator = await newUser();
    const friend = await newUser();
    const stranger = await newUser();
    await befriend(creator, friend);
    const { body: c } = await create(creator, body());
    const invite = (p: Person, ids: string[]) =>
      api().post(`/challenges/${c.id}/invites`).set(bearer(p)).send({ user_ids: ids });
    assert.equal(
      (await invite(friend, [stranger.user.id])).status,
      404,
      'not yet invited: cannot even see it',
    );
    const ok = await invite(creator, [friend.user.id, stranger.user.id]);
    assert.deepEqual(
      { invited: ok.body.invited, rejected: ok.body.rejected },
      { invited: 1, rejected: [stranger.user.id] },
    );
    assert.equal((await invite(creator, [friend.user.id])).body.invited, 0, 'already invited');
    assert.equal((await invite(friend, [stranger.user.id])).status, 403);
  });
});

describe('live leaderboard and privacy', () => {
  async function twoFriendsInActiveChallenge() {
    const alice = await newUser({ goal: 2000 });
    const bob = await newUser({ goal: 2000 });
    await befriend(alice, bob);
    const { body } = await api()
      .post('/challenges')
      .set(bearer(alice))
      .send({
        title: 'Duel',
        type: 'distance',
        target_value: 20_000,
        starts_at: iso(-4 * 60_000), // within the 5-minute "start now" slack
        ends_at: iso(3 * DAY),
        invite_user_ids: [bob.user.id],
      });
    await api().post(`/challenges/${body.id}/join`).set(bearer(bob));
    return { alice, bob, id: body.id as string };
  }
  const M = 111_195;
  async function uploadRun(p: Person, legs: number) {
    const t0 = Date.now() - 180_000; // 3 minutes ago: after the challenge started
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
    return res.body as { id: string; distance_m: number };
  }

  it('when one friend finishes a run the other’s board changes, and is told live', async () => {
    const { alice, bob, id } = await twoFriendsInActiveChallenge();
    const before = (await api().get(`/challenges/${id}`).set(bearer(alice))).body;
    assert.equal(before.my_value, 0);

    events.length = 0;
    const run = await uploadRun(bob, 150); // 1.5 km
    const told = events
      .filter(
        (e) =>
          e.event.type === 'leaderboard' && (e.event as { challengeId: string }).challengeId === id,
      )
      .map((e) => e.userId)
      .sort();
    assert.deepEqual(told, [alice.user.id, bob.user.id].sort(), 'both members get a live hint');

    const after = (await api().get(`/challenges/${id}`).set(bearer(alice))).body;
    assert.equal(after.leaderboard[0].user.id, bob.user.id);
    assert.equal(after.leaderboard[0].value, run.distance_m);
    assert.equal(after.my_rank, 2);
    assert.equal(after.my_value, 0);
    assert.equal(after.leaderboard[0].rank, 1);

    // and the list shows my own rank without the others' numbers
    const mine = (await api().get('/challenges').set(bearer(alice))).body.challenges[0];
    assert.equal(mine.my_rank, 2);
    assert.equal(mine.member_count, 2);
  });

  it('deleting a run updates the board and notifies, and outsiders hear nothing', async () => {
    const { alice, bob, id } = await twoFriendsInActiveChallenge();
    const outsider = await newUser();
    const run = await uploadRun(bob, 150);
    events.length = 0;
    assert.equal((await api().delete(`/runs/${run.id}`).set(bearer(bob))).status, 204);
    assert.ok(events.some((e) => e.userId === alice.user.id && e.event.type === 'leaderboard'));
    assert.ok(!events.some((e) => e.userId === outsider.user.id));
    assert.equal(
      (await api().get(`/challenges/${id}`).set(bearer(alice))).body.leaderboard[0].value,
      0,
    );
  });

  it('only scores ever reach other members: no calories, food names or goals', async () => {
    const { alice, bob, id } = await twoFriendsInActiveChallenge();
    await api().post('/food-logs').set(bearer(bob)).send({
      custom_name: 'Secret midnight pizza',
      kcal: 1234,
      meal_type: 'dinner',
      log_date: '2026-11-05',
    });
    const text =
      JSON.stringify((await api().get(`/challenges/${id}`).set(bearer(alice))).body) +
      JSON.stringify((await api().get('/challenges').set(bearer(alice))).body);
    for (const leak of [
      'Secret',
      'pizza',
      '1234',
      'kcal',
      'daily_kcal_goal',
      'weight',
      '@example.com',
    ]) {
      assert.ok(!text.includes(leak), `leaked: ${leak}`);
    }
  });

  it('clients can never write scores or touch someone else’s challenge data directly', async () => {
    const { alice, bob, id } = await twoFriendsInActiveChallenge();
    // The database itself refuses (no write privilege) even for a member acting through app_user.
    await assert.rejects(
      db.asUser(bob.user.id, (q) =>
        q.query(`update challenge_scores set value = 999999 where challenge_id = $1`, [id]),
      ),
    );
    await assert.rejects(
      db.asUser(bob.user.id, (q) =>
        q.query(`insert into challenge_scores (challenge_id, user_id, value) values ($1, $2, 1)`, [
          id,
          bob.user.id,
        ]),
      ),
    );
    await assert.rejects(
      db.asUser(bob.user.id, (q) => q.query(`select advance_challenges()`)),
      'the scheduler function is not callable by users',
    );
    await assert.rejects(
      db.asUser(bob.user.id, (q) => q.query(`select recompute_challenge_scores($1)`, [id])),
    );
    assert.equal(
      (await api().get(`/challenges/${id}`).set(bearer(alice))).body.leaderboard[1].value,
      0,
    );
  });

  it('deleting a user who is in an active challenge works and removes their score', async () => {
    const { alice, bob, id } = await twoFriendsInActiveChallenge();
    await uploadRun(bob, 150);
    await pg.query(`delete from users where id = $1`, [bob.user.id]);
    const after = (await api().get(`/challenges/${id}`).set(bearer(alice))).body;
    assert.equal(after.leaderboard.length, 1);
    assert.equal((await board(id)).has(bob.user.id), false);
  });
});

describe('validateChallenge', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  const ok = {
    type: 'distance' as const,
    target_value: 10_000,
    starts_at: '2026-11-07T00:00:00Z',
    ends_at: '2026-11-14T00:00:00Z',
  };
  it('accepts sensible definitions, including "start now"', () => {
    assert.equal(validateChallenge(ok, now), null);
    assert.equal(
      validateChallenge({ ...ok, starts_at: '2026-11-06T11:58:00Z' }, now),
      null,
      'two minutes ago is fine',
    );
    assert.equal(
      validateChallenge(
        { type: 'kcal_streak', target_value: 7, starts_at: ok.starts_at, ends_at: ok.ends_at },
        now,
      ),
      null,
    );
  });
  it('rejects bad windows and targets', () => {
    assert.ok(validateChallenge({ ...ok, starts_at: '2026-11-06T11:00:00Z' }, now));
    assert.ok(validateChallenge({ ...ok, ends_at: '2026-11-07T00:30:00Z' }, now));
    assert.ok(validateChallenge({ ...ok, ends_at: '2027-03-01T00:00:00Z' }, now));
    assert.ok(
      validateChallenge(
        { ...ok, starts_at: '2027-12-01T00:00:00Z', ends_at: '2027-12-08T00:00:00Z' },
        now,
      ),
    );
    assert.ok(validateChallenge({ ...ok, target_value: 999 }, now));
    assert.ok(validateChallenge({ ...ok, type: 'run_count', target_value: 1.5 }, now));
    assert.ok(
      validateChallenge({ ...ok, type: 'kcal_streak', target_value: 8 }, now),
      '8 days in a 7-day window',
    );
    assert.ok(validateChallenge({ ...ok, ends_at: 'garbage' }, now));
  });
});
