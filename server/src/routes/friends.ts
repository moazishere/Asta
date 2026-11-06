import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';

import type { Config } from '../config.js';
import type { Db, Queryable } from '../db.js';
import { HttpError, isUniqueViolation } from '../errors.js';
import { USERNAME_PATTERN } from '../lib/invitePage.js';
import { getWeekAnchor } from '../lib/weekAnchor.js';
import { currentUserId } from '../middleware/auth.js';
import { displayNameOf, pushToUser, type PushSender } from '../push.js';
import type { Hub } from '../realtime.js';

type Deps = { db: Db; hub: Hub; config: Config; push: PushSender };

type Relationship = {
  friendship_id: string;
  user_id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  status: 'pending' | 'accepted' | 'blocked';
  direction: 'incoming' | 'outgoing';
  created_at: string;
};

const MAX_PENDING_OUTGOING = 50;
const RECENT_RUNS = 20;

const idParam = z.object({ id: z.string().uuid() });
const usernameField = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, 'Invalid username');

// What a client may know about another person: never email, weight, height or goals.
const card = (r: Relationship) => ({
  id: r.user_id,
  username: r.username,
  display_name: r.display_name,
  avatar_url: r.avatar_url,
});

async function relationshipWith(q: Queryable, userId: string): Promise<Relationship | undefined> {
  const r = await q.query<Relationship>(`select * from my_relationships() where user_id = $1`, [
    userId,
  ]);
  return r.rows[0];
}

export function friendsRouter({ db, hub, config, push }: Deps) {
  const router = Router();

  if (config.rateLimit) {
    // Lookups and requests are the abusable parts (probing usernames, spamming requests): limit per
    // signed-in user rather than per IP.
    const perUser = rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 60,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: (req) => req.userId ?? 'anonymous',
      validate: { keyGeneratorIpFallback: false },
    });
    router.use('/lookup', perUser);
    router.post('/requests', perUser);
  }

  /** Tells both people's open apps to refetch their friends data. */
  const notify = (...userIds: string[]) => {
    for (const id of new Set(userIds)) hub.publish(id, { type: 'friends' });
  };

  // ---- overview --------------------------------------------------------------------------------

  // Everything the Friends screen needs in one call: friends with their distance this week, incoming
  // and outgoing requests, and people I blocked.
  router.get('/', async (req, res) => {
    const me = currentUserId(req);
    const data = await db.asUser(me, async (q) => {
      const rels = (
        await q.query<Relationship>(`select * from my_relationships() order by created_at desc`)
      ).rows;
      const anchor = await getWeekAnchor(q);

      // friend_runs only contains runs of ACCEPTED friends, so a stranger's distance can never leak here.
      const week = anchor
        ? (
            await q.query<{ user_id: string; distance_m: number; runs: number }>(
              `select user_id, sum(distance_m)::float8 as distance_m, count(*)::int as runs
               from friend_runs
               where (started_at at time zone $1)::date >= $2::date
               group by user_id`,
              [anchor.tz, anchor.week_start],
            )
          ).rows
        : [];
      return { rels, week };
    });

    const weekOf = (id: string) => data.week.find((w) => w.user_id === id);
    const friends = data.rels
      .filter((r) => r.status === 'accepted')
      .map((r) => ({
        friendship_id: r.friendship_id,
        user: card(r),
        since: r.created_at,
        week_distance_m: weekOf(r.user_id)?.distance_m ?? 0,
        week_runs: weekOf(r.user_id)?.runs ?? 0,
      }))
      .sort((a, b) =>
        (a.user.display_name ?? a.user.username).localeCompare(
          b.user.display_name ?? b.user.username,
        ),
      );
    const pending = (direction: Relationship['direction']) =>
      data.rels
        .filter((r) => r.status === 'pending' && r.direction === direction)
        .map((r) => ({ friendship_id: r.friendship_id, user: card(r), created_at: r.created_at }));

    res.json({
      friends,
      incoming: pending('incoming'),
      outgoing: pending('outgoing'),
      blocked: data.rels
        .filter((r) => r.status === 'blocked')
        .map((r) => ({ friendship_id: r.friendship_id, user: card(r) })),
    });
  });

  // ---- finding someone -------------------------------------------------------------------------

  // Exact username only. People who blocked me do not show up at all (see find_profile_by_username).
  router.get('/lookup', async (req, res) => {
    const { username } = z.object({ username: usernameField }).parse(req.query);
    const found = await db.asUser(currentUserId(req), async (q) => {
      const r = await q.query<{
        id: string;
        username: string;
        display_name: string | null;
        avatar_url: string | null;
      }>(`select * from find_profile_by_username($1)`, [username]);
      const user = r.rows[0];
      if (!user) return null;
      const rel = await relationshipWith(q, user.id);
      const relationship = !rel
        ? 'none'
        : rel.status === 'accepted'
          ? 'friends'
          : rel.status === 'blocked'
            ? 'blocked'
            : rel.direction; // 'outgoing' | 'incoming' (pending)
      return { user, relationship, friendship_id: rel?.friendship_id ?? null };
    });
    if (!found) throw new HttpError(404, 'user_not_found', 'No one has that username');
    res.json(found);
  });

  // ---- requests --------------------------------------------------------------------------------

  router.post('/requests', async (req, res) => {
    const me = currentUserId(req);
    const { username } = z.object({ username: usernameField }).strict().parse(req.body);

    try {
      const result = await db.asUser(me, async (q) => {
        const found = await q.query<{
          id: string;
          username: string;
          display_name: string | null;
          avatar_url: string | null;
        }>(`select * from find_profile_by_username($1)`, [username]);
        const target = found.rows[0];
        if (!target) throw new HttpError(404, 'user_not_found', 'No one has that username');

        const rel = await relationshipWith(q, target.id);
        if (rel) {
          if (rel.status === 'accepted') throw new HttpError(409, 'already_friends');
          if (rel.status === 'blocked')
            throw new HttpError(409, 'you_blocked_them', 'Unblock this person first');
          if (rel.direction === 'outgoing') throw new HttpError(409, 'already_requested');
          // They already asked me: sending a request back is the same as accepting theirs.
          await q.query(`update friendships set status = 'accepted' where id = $1`, [
            rel.friendship_id,
          ]);
          return { status: 'accepted' as const, friendship_id: rel.friendship_id, target };
        }

        const count = await q.query<{ n: number }>(
          `select count(*)::int n from my_relationships() where status = 'pending' and direction = 'outgoing'`,
        );
        if ((count.rows[0]?.n ?? 0) >= MAX_PENDING_OUTGOING) {
          throw new HttpError(429, 'too_many_requests', 'Too many pending requests');
        }
        const inserted = await q.query<{ id: string }>(
          `insert into friendships (requester_id, addressee_id, status) values (app.uid(), $1, 'pending') returning id`,
          [target.id],
        );
        return { status: 'pending' as const, friendship_id: inserted.rows[0]!.id, target };
      });

      notify(me, result.target.id);
      if (result.status === 'pending') {
        const name = await displayNameOf(db, me);
        await pushToUser(db, push, result.target.id, 'friend_requests', {
          title: 'New friend request',
          body: `${name} wants to be your friend.`,
          data: { type: 'friend_request' },
        });
      }
      res
        .status(201)
        .json({ status: result.status, friendship_id: result.friendship_id, user: result.target });
    } catch (err) {
      if (isUniqueViolation(err)) throw new HttpError(409, 'already_related');
      throw err;
    }
  });

  router.post('/requests/:id/accept', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const requester = await db.asUser(me, async (q) => {
      // Row Level Security also enforces this: only the addressee can move pending -> accepted.
      const r = await q.query<{ requester_id: string }>(
        `update friendships set status = 'accepted'
         where id = $1 and addressee_id = app.uid() and status = 'pending' returning requester_id`,
        [id],
      );
      return r.rows[0]?.requester_id;
    });
    if (!requester) throw new HttpError(404, 'request_not_found');
    notify(me, requester);
    res.status(204).end();
  });

  // Declining just deletes the request (the sender is not told it was declined, only that it is gone).
  router.post('/requests/:id/decline', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const requester = await db.asUser(me, async (q) => {
      const r = await q.query<{ requester_id: string }>(
        `delete from friendships where id = $1 and addressee_id = app.uid() and status = 'pending' returning requester_id`,
        [id],
      );
      return r.rows[0]?.requester_id;
    });
    if (!requester) throw new HttpError(404, 'request_not_found');
    notify(me, requester);
    res.status(204).end();
  });

  router.delete('/requests/:id', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const addressee = await db.asUser(me, async (q) => {
      const r = await q.query<{ addressee_id: string }>(
        `delete from friendships where id = $1 and requester_id = app.uid() and status = 'pending' returning addressee_id`,
        [id],
      );
      return r.rows[0]?.addressee_id;
    });
    if (!addressee) throw new HttpError(404, 'request_not_found');
    notify(me, addressee);
    res.status(204).end();
  });

  // ---- blocking --------------------------------------------------------------------------------

  router.post('/block', async (req, res) => {
    const me = currentUserId(req);
    const { user_id } = z.object({ user_id: z.string().uuid() }).strict().parse(req.body);
    try {
      // block_user() replaces any existing relationship with a one-way "blocked" row owned by me.
      await db.asUser(me, (q) => q.query(`select block_user($1)`, [user_id]));
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === '23503') throw new HttpError(404, 'user_not_found'); // foreign key: no such user
      if (code === 'P0001') throw new HttpError(400, 'cannot_block_self');
      throw err;
    }
    notify(me, user_id);
    res.status(204).end();
  });

  router.delete('/block/:userId', async (req, res) => {
    const me = currentUserId(req);
    const { userId } = z.object({ userId: z.string().uuid() }).parse(req.params);
    const removed = await db.asUser(me, async (q) => {
      const r = await q.query(
        `delete from friendships where requester_id = app.uid() and addressee_id = $1 and status = 'blocked' returning id`,
        [userId],
      );
      return r.rows.length > 0;
    });
    if (!removed) throw new HttpError(404, 'not_blocked');
    notify(me);
    res.status(204).end();
  });

  // ---- a friend's profile ----------------------------------------------------------------------

  // Recent runs come from the friend_runs view: the route is route_polyline_public (first and last
  // ~200 m removed) and there are no GPS points, calories or flags. Their food log is not reachable here
  // or anywhere else; the database only lets the owner read it.
  router.get('/:id/profile', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const data = await db.asUser(currentUserId(req), async (q) => {
      const rel = await relationshipWith(q, id);
      if (!rel || rel.status !== 'accepted') return null;

      const runs = await q.query(
        `select id, started_at, ended_at, distance_m, moving_time_s, avg_pace_s_per_km, route_polyline_public
         from friend_runs where user_id = $1 order by started_at desc, id desc limit $2`,
        [id, RECENT_RUNS],
      );
      const anchor = await getWeekAnchor(q);
      const week = anchor
        ? await q.query<{ distance_m: number; runs: number }>(
            `select coalesce(sum(distance_m), 0)::float8 as distance_m, count(*)::int as runs
             from friend_runs where user_id = $1 and (started_at at time zone $2)::date >= $3::date`,
            [id, anchor.tz, anchor.week_start],
          )
        : null;
      return { rel, runs: runs.rows, week: week?.rows[0] };
    });
    // Not a friend (or unfriended, or never existed) are all the same answer: 404.
    if (!data) throw new HttpError(404, 'friend_not_found');
    res.json({
      user: card(data.rel),
      friendship_id: data.rel.friendship_id,
      since: data.rel.created_at,
      week_distance_m: data.week?.distance_m ?? 0,
      week_runs: data.week?.runs ?? 0,
      runs: data.runs,
    });
  });

  // ---- removing a friend -----------------------------------------------------------------------

  router.delete('/:id', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const other = await db.asUser(me, async (q) => {
      const r = await q.query<{ requester_id: string; addressee_id: string }>(
        `delete from friendships where id = $1 and status = 'accepted' returning requester_id, addressee_id`,
        [id],
      );
      const row = r.rows[0];
      return row ? (row.requester_id === me ? row.addressee_id : row.requester_id) : undefined;
    });
    if (!other) throw new HttpError(404, 'friendship_not_found');
    notify(me, other);
    res.status(204).end();
  });

  return router;
}
