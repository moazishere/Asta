// Verifies the privacy rules in the database itself (Row Level Security + views), independent of the
// API code: even a buggy route could not read data the policies forbid. Runs the real migrations in
// an in-process Postgres (PGlite) and acts as the low-privilege `app_user` role, exactly like the API.
import assert from 'node:assert/strict';
import { before, describe, it } from 'node:test';

import { createTestDb } from './helpers.js';

const { pg } = await createTestDb();

const ids = {
  alice: '00000000-0000-0000-0000-00000000000a',
  bob: '00000000-0000-0000-0000-00000000000b',
  carol: '00000000-0000-0000-0000-00000000000c',
};

/** Run `fn` as the API would for `userId`: role app_user, with app.user_id bound to the caller. */
async function as<T>(userId: string | null, fn: () => Promise<T>): Promise<T> {
  await pg.exec('set role app_user');
  await pg.query(`select set_config('app.user_id', $1, false)`, [userId ?? '']);
  try {
    return await fn();
  } finally {
    await pg.exec('reset role');
    await pg.query(`select set_config('app.user_id', '', false)`);
  }
}
// Rows are loosely typed on purpose: these tests probe which columns/rows exist at all.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = async (sql: string, params?: unknown[]): Promise<any[]> =>
  (await pg.query(sql, params)).rows;
const rejects = (promise: Promise<unknown>) => assert.rejects(promise);

before(async () => {
  for (const [name, id] of Object.entries(ids)) {
    await pg.exec(
      `insert into users (id, email, password_hash) values ('${id}', '${name}@test.dev', 'x')`,
    );
    await pg.exec(`update profiles set username = '${name}', weight_kg = 70 where id = '${id}'`);
  }
  // alice <-> bob are friends; carol is a stranger.
  await pg.exec(`insert into friendships (requester_id, addressee_id, status)
                 values ('${ids.alice}', '${ids.bob}', 'accepted')`);
  await pg.exec(`insert into runs (id, user_id, started_at, ended_at, distance_m, moving_time_s, route_polyline, route_polyline_public)
                 values ('10000000-0000-0000-0000-000000000001', '${ids.alice}', now() - interval '1 hour', now(),
                         5000, 1800, 'FULL_ROUTE', 'TRIMMED_ROUTE')`);
  await pg.exec(`insert into run_points (run_id, seq, recorded_at, lat, lng)
                 values ('10000000-0000-0000-0000-000000000001', 0, now(), 33.5, 36.3)`);
  await pg.exec(`insert into food_logs (user_id, log_date, meal_type, custom_name, kcal)
                 values ('${ids.alice}', current_date, 'lunch', 'Hummus', 300)`);
});

describe('signup trigger', () => {
  it('creates a profile with a placeholder username when a user signs up', async () => {
    const newId = '00000000-0000-0000-0000-0000000000ff';
    await pg.exec(
      `insert into users (id, email, password_hash) values ('${newId}', 'new@test.dev', 'x')`,
    );
    const [row] = await q(`select username from public.profiles where id = $1`, [newId]);
    assert.match(row.username, /^user_[0-9a-f]{8}$/);
  });
});

describe('profiles', () => {
  it('owner can read their own full profile', async () => {
    const rows = await as(ids.alice, () => q(`select weight_kg from public.profiles`));
    assert.equal(rows.length, 1);
  });
  it('friends cannot read the profiles table (weight etc. stay private)', async () => {
    const rows = await as(ids.bob, () =>
      q(`select * from public.profiles where id = $1`, [ids.alice]),
    );
    assert.equal(rows.length, 0);
  });
  it('profile_cards shows me and my friends but not strangers, and no sensitive columns', async () => {
    const rows = await as(ids.bob, () => q(`select * from public.profile_cards order by username`));
    assert.deepEqual(
      rows.map((r) => r.username),
      ['alice', 'bob'],
    );
    assert.equal('weight_kg' in rows[0], false);
  });
  it('find_profile_by_username is an exact match only', async () => {
    assert.equal(
      (await as(ids.carol, () => q(`select * from public.find_profile_by_username('alice')`)))
        .length,
      1,
    );
    assert.equal(
      (await as(ids.carol, () => q(`select * from public.find_profile_by_username('ali')`))).length,
      0,
    );
  });
  it('a user cannot edit someone else’s profile', async () => {
    const rows = await as(ids.carol, () =>
      q(`update public.profiles set display_name = 'x' where id = $1 returning id`, [ids.alice]),
    );
    assert.equal(rows.length, 0);
  });
});

describe('runs and routes', () => {
  it('owner sees full route', async () => {
    const [r] = await as(ids.alice, () => q(`select route_polyline from public.runs`));
    assert.equal(r.route_polyline, 'FULL_ROUTE');
  });
  it('a friend cannot read the runs table or run_points directly', async () => {
    assert.equal((await as(ids.bob, () => q(`select * from public.runs`))).length, 0);
    assert.equal((await as(ids.bob, () => q(`select * from public.run_points`))).length, 0);
  });
  it('a friend sees only the trimmed route through friend_runs', async () => {
    const [r] = await as(ids.bob, () => q(`select * from public.friend_runs`));
    assert.equal(r.route_polyline_public, 'TRIMMED_ROUTE');
    assert.equal('route_polyline' in r, false);
    assert.equal('kcal_est' in r, false);
  });
  it('a stranger sees nothing', async () => {
    assert.equal((await as(ids.carol, () => q(`select * from public.friend_runs`))).length, 0);
  });
  it('the database flags impossible speeds and the flag cannot be cleared', async () => {
    await as(ids.alice, () =>
      pg.query(
        `insert into public.runs (id, user_id, started_at, ended_at, distance_m, moving_time_s, suspicious)
                values ('10000000-0000-0000-0000-000000000002', $1, now() - interval '1 hour', now(), 20000, 1800, false)`,
        [ids.alice],
      ),
    );
    const [r] = await q(
      `select suspicious from public.runs where id = '10000000-0000-0000-0000-000000000002'`,
    );
    assert.equal(r.suspicious, true);
    await as(ids.alice, () =>
      pg.query(
        `update public.runs set suspicious = false where id = '10000000-0000-0000-0000-000000000002'`,
      ),
    );
    const [r2] = await q(
      `select suspicious from public.runs where id = '10000000-0000-0000-0000-000000000002'`,
    );
    assert.equal(r2.suspicious, true);
  });
});

describe('food_logs', () => {
  it('only the owner can read them, even friends cannot', async () => {
    assert.equal((await as(ids.alice, () => q(`select * from public.food_logs`))).length, 1);
    assert.equal((await as(ids.bob, () => q(`select * from public.food_logs`))).length, 0);
    assert.equal((await as(ids.carol, () => q(`select * from public.food_logs`))).length, 0);
  });
  it('nobody can insert a log for another user', async () => {
    await rejects(
      as(ids.bob, () =>
        pg.query(
          `insert into public.food_logs (user_id, log_date, meal_type, custom_name, kcal)
                values ($1, current_date, 'lunch', 'x', 1)`,
          [ids.alice],
        ),
      ),
    );
  });
});

describe('friendships', () => {
  it('only the addressee can accept a request', async () => {
    await pg.exec(`insert into public.friendships (id, requester_id, addressee_id) values
                   ('20000000-0000-0000-0000-000000000001', '${ids.carol}', '${ids.alice}')`);
    const own = await as(ids.carol, () =>
      q(
        `update public.friendships set status = 'accepted' where id = '20000000-0000-0000-0000-000000000001' returning id`,
      ),
    );
    assert.equal(own.length, 0, 'requester must not accept their own request');
    const ok = await as(ids.alice, () =>
      q(
        `update public.friendships set status = 'accepted' where id = '20000000-0000-0000-0000-000000000001' returning id`,
      ),
    );
    assert.equal(ok.length, 1);
  });
  it('the parties of a friendship cannot be rewritten while accepting, and accepted rows are frozen', async () => {
    await pg.exec(`insert into public.friendships (id, requester_id, addressee_id) values
                   ('20000000-0000-0000-0000-000000000009', '${ids.carol}', '${ids.bob}')`);
    await rejects(
      as(ids.bob, () =>
        pg.query(
          `update public.friendships set status = 'accepted', requester_id = $1
                where id = '20000000-0000-0000-0000-000000000009'`,
          [ids.alice],
        ),
      ),
    );
    await pg.exec(
      `delete from public.friendships where id = '20000000-0000-0000-0000-000000000009'`,
    );
    // The already-accepted alice<->carol row from the previous test can no longer be modified by anyone.
    const rows = await as(ids.alice, () =>
      q(
        `update public.friendships set requester_id = requester_id where id = '20000000-0000-0000-0000-000000000001' returning id`,
      ),
    );
    assert.equal(rows.length, 0);
  });
  it('a block is invisible to the blocked user and hides them from lookup', async () => {
    await pg.exec(
      `delete from public.friendships where id = '20000000-0000-0000-0000-000000000001'`,
    );
    await as(ids.alice, () => pg.query(`select public.block_user($1)`, [ids.carol]));
    assert.equal((await as(ids.carol, () => q(`select * from public.friendships`))).length, 0);
    assert.equal(
      (await as(ids.carol, () => q(`select * from public.find_profile_by_username('alice')`)))
        .length,
      0,
    );
    assert.equal(
      (await as(ids.alice, () => q(`select * from public.friendships where status = 'blocked'`)))
        .length,
      1,
    );
  });
  it('a stranger cannot read or create friendships on behalf of others', async () => {
    await rejects(
      as(ids.carol, () =>
        pg.query(`insert into public.friendships (requester_id, addressee_id) values ($1, $2)`, [
          ids.alice,
          ids.bob,
        ]),
      ),
    );
  });
});

describe('challenges', () => {
  const cid = '30000000-0000-0000-0000-000000000001';
  before(async () => {
    await as(ids.alice, async () => {
      await pg.query(
        `insert into public.challenges (id, creator_id, title, type, target_value, starts_at, ends_at)
                      values ($1, $2, '100 km', 'distance', 100, now() + interval '1 day', now() + interval '8 days')`,
        [cid, ids.alice],
      );
      await pg.query(
        `insert into public.challenge_members (challenge_id, user_id, status) values ($1, $2, 'joined')`,
        [cid, ids.alice],
      );
      await pg.query(
        `insert into public.challenge_members (challenge_id, user_id, status) values ($1, $2, 'invited')`,
        [cid, ids.bob],
      );
    });
    await pg.exec(
      `insert into public.challenge_scores (challenge_id, user_id, value) values ('${cid}', '${ids.alice}', 12)`,
    );
  });
  it('an invited friend can see the challenge before joining; a stranger cannot', async () => {
    assert.equal((await as(ids.bob, () => q(`select * from public.challenges`))).length, 1);
    assert.equal((await as(ids.carol, () => q(`select * from public.challenges`))).length, 0);
  });
  it('the creator can only invite accepted friends', async () => {
    await rejects(
      as(ids.alice, () =>
        pg.query(
          `insert into public.challenge_members (challenge_id, user_id, status) values ($1, $2, 'invited')`,
          [cid, ids.carol],
        ),
      ),
    );
  });
  it('nobody can add themselves to someone else’s challenge', async () => {
    await rejects(
      as(ids.carol, () =>
        pg.query(
          `insert into public.challenge_members (challenge_id, user_id, status) values ($1, $2, 'joined')`,
          [cid, ids.carol],
        ),
      ),
    );
  });
  it('an invited user can accept and gets a joined_at stamp', async () => {
    await as(ids.bob, () =>
      pg.query(
        `update public.challenge_members set status = 'joined' where challenge_id = $1 and user_id = $2`,
        [cid, ids.bob],
      ),
    );
    const [m] = await q(
      `select joined_at from public.challenge_members where challenge_id = $1 and user_id = $2`,
      [cid, ids.bob],
    );
    assert.ok(m.joined_at);
  });
  it('members read scores; non-members do not', async () => {
    assert.equal((await as(ids.bob, () => q(`select * from public.challenge_scores`))).length, 1);
    assert.equal((await as(ids.carol, () => q(`select * from public.challenge_scores`))).length, 0);
  });
  it('NO client can write challenge_scores, not even the creator for themselves', async () => {
    await rejects(
      as(ids.alice, () =>
        pg.query(`update public.challenge_scores set value = 9999 where user_id = $1`, [ids.alice]),
      ),
    );
    await rejects(
      as(ids.alice, () =>
        pg.query(
          `insert into public.challenge_scores (challenge_id, user_id, value) values ($1, $2, 1)`,
          [cid, ids.bob],
        ),
      ),
    );
    await rejects(as(ids.alice, () => pg.query(`delete from public.challenge_scores`)));
  });
  it('the creator cannot activate a challenge or edit it after it starts', async () => {
    await rejects(
      as(ids.alice, () =>
        pg.query(`update public.challenges set status = 'active' where id = $1`, [cid]),
      ),
    );
  });
});

describe('auth tables and unauthenticated access', () => {
  it('app_user can never read the auth tables (password hashes, refresh tokens, login codes)', async () => {
    for (const table of ['users', 'refresh_tokens', 'auth_codes']) {
      await rejects(as(ids.alice, () => pg.query(`select * from ${table}`)));
    }
  });
  it('with no user bound, row-level data is invisible', async () => {
    for (const table of [
      'profiles',
      'runs',
      'food_logs',
      'challenges',
      'challenge_scores',
      'push_tokens',
    ]) {
      assert.equal((await as(null, () => q(`select * from ${table}`))).length, 0, table);
    }
  });
});
