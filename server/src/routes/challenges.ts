import { randomUUID } from 'node:crypto';

import { Router, type Request } from 'express';
import { z } from 'zod';

import type { Db, Queryable } from '../db.js';
import { HttpError } from '../errors.js';
import { notifyChallenge } from '../lib/challengeEvents.js';
import { validateChallenge, type ChallengeType } from '../lib/challengeRules.js';
import { currentUserId } from '../middleware/auth.js';
import type { Hub } from '../realtime.js';
import { tickChallenges } from '../scheduler.js';

type Deps = { db: Db; hub: Hub };

const idParam = z.object({ id: z.string().uuid() });
const type = z.enum(['distance', 'run_count', 'kcal_streak']);
const title = z.string().trim().min(1).max(80);
const dateTime = z.string().datetime({ offset: true });

const createBody = z
  .object({
    title,
    type,
    /** Metres for distance, runs for run_count, days for kcal_streak. */
    target_value: z.number().positive().finite(),
    starts_at: dateTime,
    ends_at: dateTime,
    invite_user_ids: z.array(z.string().uuid()).max(50).default([]),
  })
  .strict();

const patchBody = z
  .object({
    title,
    target_value: z.number().positive().finite(),
    starts_at: dateTime,
    ends_at: dateTime,
  })
  .partial()
  .strict();

const invitesBody = z.object({ user_ids: z.array(z.string().uuid()).min(1).max(50) }).strict();

type Card = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

type ChallengeRow = {
  id: string;
  title: string;
  type: ChallengeType;
  target_value: number;
  starts_at: string;
  ends_at: string;
  status: 'draft' | 'active' | 'ended';
  creator_id: string;
  winner_id: string | null;
  my_status: 'invited' | 'joined';
};

const COLUMNS = `c.id, c.title, c.type, c.target_value, c.starts_at, c.ends_at, c.status, c.creator_id, c.winner_id`;

/** My challenge by id, with my membership state. Row Level Security hides everything I am not part of. */
async function loadMine(q: Queryable, id: string): Promise<ChallengeRow | undefined> {
  const r = await q.query<ChallengeRow>(
    `select ${COLUMNS}, m.status as my_status
     from challenges c join challenge_members m on m.challenge_id = c.id and m.user_id = app.uid()
     where c.id = $1 and m.status in ('invited', 'joined')`,
    [id],
  );
  return r.rows[0];
}

async function cardFor(q: Queryable, userId: string | null): Promise<Card | null> {
  if (!userId) return null;
  const r = await q.query<Card>(
    `select id, username, display_name, avatar_url from profile_cards where id = $1`,
    [userId],
  );
  return r.rows[0] ?? null;
}

export function challengesRouter({ db, hub }: Deps) {
  const router = Router();

  // ---- list ------------------------------------------------------------------------------------

  // Every challenge I am invited to or in. The app groups them into Invitations / Active / Upcoming /
  // Finished. Only the member's OWN score and rank are included here (the full board is in the detail).
  router.get('/', async (req, res) => {
    const rows = await db.asUser(currentUserId(req), async (q) => {
      const r = await q.query(
        `select ${COLUMNS}, m.status as my_status,
                p.username as creator_username, p.display_name as creator_display_name, p.avatar_url as creator_avatar_url,
                case when m.status = 'joined'
                     then (select count(*)::int from challenge_members x where x.challenge_id = c.id and x.status = 'joined') end as member_count,
                s.value::float8 as my_value,
                case when m.status = 'joined' and s.user_id is not null then (
                  select count(*)::int + 1 from challenge_scores o
                  where o.challenge_id = c.id and (
                        o.value > s.value
                     or (o.value = s.value and o.reached_at < s.reached_at)
                     or (o.value = s.value and o.reached_at = s.reached_at and o.user_id < s.user_id))
                ) end as my_rank
         from challenges c
         join challenge_members m on m.challenge_id = c.id and m.user_id = app.uid()
         left join challenge_scores s on s.challenge_id = c.id and s.user_id = app.uid()
         left join profile_cards p on p.id = c.creator_id
         where m.status in ('invited', 'joined')
         order by c.starts_at desc, c.id`,
      );
      return r.rows as (ChallengeRow & {
        creator_username: string | null;
        creator_display_name: string | null;
        creator_avatar_url: string | null;
        member_count: number | null;
        my_value: number | null;
        my_rank: number | null;
      })[];
    });
    res.json({
      challenges: rows.map((c) => ({
        id: c.id,
        title: c.title,
        type: c.type,
        target_value: c.target_value,
        starts_at: c.starts_at,
        ends_at: c.ends_at,
        status: c.status,
        my_status: c.my_status,
        creator: c.creator_username
          ? {
              id: c.creator_id,
              username: c.creator_username,
              display_name: c.creator_display_name,
              avatar_url: c.creator_avatar_url,
            }
          : null,
        member_count: c.member_count,
        my_value: c.my_value,
        my_rank: c.my_rank,
      })),
    });
  });

  // ---- detail + live leaderboard ---------------------------------------------------------------

  router.get('/:id', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const detail = await db.asUser(me, async (q) => {
      const c = await loadMine(q, id);
      if (!c) return null;
      const creator = await cardFor(q, c.creator_id);

      // Invited people see what they were invited to, but not the standings: that is for members only.
      let leaderboard: { rank: number; user: Card; value: number; reached_at: string }[] = [];
      if (c.my_status === 'joined') {
        const rows = await q.query<Card & { value: number; reached_at: string }>(
          `select m.user_id as id, p.username, p.display_name, p.avatar_url,
                  coalesce(s.value, 0)::float8 as value, coalesce(s.reached_at, m.joined_at) as reached_at
           from challenge_members m
           join profile_cards p on p.id = m.user_id
           left join challenge_scores s on s.challenge_id = m.challenge_id and s.user_id = m.user_id
           where m.challenge_id = $1 and m.status = 'joined'
           order by coalesce(s.value, 0) desc, coalesce(s.reached_at, m.joined_at) asc, m.user_id`,
          [id],
        );
        // Ties are broken by who reached the value first (earlier reached_at), already in the ORDER BY.
        leaderboard = rows.rows.map((r, i) => ({
          rank: i + 1,
          user: {
            id: r.id,
            username: r.username,
            display_name: r.display_name,
            avatar_url: r.avatar_url,
          },
          value: r.value,
          reached_at: r.reached_at,
        }));
      }
      return { c, creator, leaderboard, me };
    });
    if (!detail) throw new HttpError(404, 'challenge_not_found');

    const { c, creator, leaderboard } = detail;
    const mine = leaderboard.find((r) => r.user.id === me);
    const winner = c.winner_id
      ? (leaderboard.find((r) => r.user.id === c.winner_id) ?? null)
      : null;
    res.json({
      id: c.id,
      title: c.title,
      type: c.type,
      target_value: c.target_value,
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      status: c.status,
      my_status: c.my_status,
      is_creator: c.creator_id === me,
      creator,
      member_count: leaderboard.length,
      leaderboard,
      my_rank: mine?.rank ?? null,
      my_value: mine?.value ?? null,
      winner: winner ? { user: winner.user, value: winner.value } : null,
    });
  });

  // ---- create / edit / delete ------------------------------------------------------------------

  router.post('/', async (req, res) => {
    const me = currentUserId(req);
    const body = createBody.parse(req.body);
    const problem = validateChallenge(body);
    if (problem) throw new HttpError(400, 'invalid_challenge', problem);

    const created = await db.asUser(me, async (q) => {
      // The id is generated here and the insert has no RETURNING: the "who may see this challenge" policy
      // cannot see a row created by the very same statement, so RETURNING would be refused.
      const id = randomUUID();
      await q.query(
        `insert into challenges (id, creator_id, title, type, target_value, starts_at, ends_at)
         values ($1, app.uid(), $2, $3, $4, $5, $6)`,
        [id, body.title, body.type, body.target_value, body.starts_at, body.ends_at],
      );
      await q.query(
        `insert into challenge_members (challenge_id, user_id, status) values ($1, app.uid(), 'joined')`,
        [id],
      );

      // Only accepted friends can be invited; anyone else is reported back instead of failing the whole call.
      const friends =
        body.invite_user_ids.length === 0
          ? []
          : (
              await q.query<{ user_id: string }>(
                `select user_id from my_relationships() where status = 'accepted' and user_id = any($1::uuid[])`,
                [body.invite_user_ids],
              )
            ).rows.map((r) => r.user_id);
      for (const friend of friends) {
        await q.query(
          `insert into challenge_members (challenge_id, user_id, status) values ($1, $2, 'invited')`,
          [id, friend],
        );
      }
      return {
        id,
        invited: friends,
        rejected: body.invite_user_ids.filter((u) => !friends.includes(u)),
      };
    });

    // A challenge that starts right now should not wait for the next scheduler tick.
    if (Date.parse(body.starts_at) <= Date.now()) await tickChallenges(db, hub);
    await notifyChallenge(db, hub, created.id, [me, ...created.invited]);

    const detail = await db.asUser(me, (q) => loadMine(q, created.id));
    res.status(201).json({
      id: created.id,
      status: detail?.status ?? 'draft',
      invited: created.invited.length,
      rejected: created.rejected,
    });
  });

  // Editing is allowed only until the challenge starts (also enforced by Row Level Security).
  router.patch('/:id', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const patch = patchBody.parse(req.body);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'nothing_to_update');

    await db.asUser(me, async (q) => {
      const cur = await loadMine(q, id);
      if (!cur) throw new HttpError(404, 'challenge_not_found');
      if (cur.creator_id !== me) throw new HttpError(403, 'not_creator');
      if (cur.status !== 'draft' || Date.parse(cur.starts_at) <= Date.now()) {
        throw new HttpError(
          409,
          'already_started',
          'A challenge cannot be changed once it has started',
        );
      }
      const merged = {
        type: cur.type,
        target_value: patch.target_value ?? cur.target_value,
        starts_at: patch.starts_at ?? new Date(cur.starts_at).toISOString(),
        ends_at: patch.ends_at ?? new Date(cur.ends_at).toISOString(),
      };
      const problem = validateChallenge(merged);
      if (problem) throw new HttpError(400, 'invalid_challenge', problem);

      const r = await q.query(
        `update challenges set title = $2, target_value = $3, starts_at = $4, ends_at = $5 where id = $1 returning id`,
        [id, patch.title ?? cur.title, merged.target_value, merged.starts_at, merged.ends_at],
      );
      if (r.rows.length === 0) throw new HttpError(409, 'already_started');
    });
    await notifyChallenge(db, hub, id, [me]);
    res.status(204).end();
  });

  router.delete('/:id', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const members = await db.asUser(me, async (q) => {
      const cur = await loadMine(q, id);
      if (!cur) throw new HttpError(404, 'challenge_not_found');
      if (cur.creator_id !== me) throw new HttpError(403, 'not_creator');
      if (cur.status !== 'draft')
        throw new HttpError(
          409,
          'already_started',
          'Only a challenge that has not started can be deleted',
        );
      const who = await q.query<{ user_id: string }>(
        `select user_id from challenge_members where challenge_id = $1`,
        [id],
      );
      await q.query(`delete from challenges where id = $1`, [id]);
      return who.rows.map((r) => r.user_id);
    });
    for (const u of new Set(members)) hub.publish(u, { type: 'challenges' });
    res.status(204).end();
  });

  // ---- invites, join, decline, leave -----------------------------------------------------------

  router.post('/:id/invites', async (req, res) => {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    const { user_ids } = invitesBody.parse(req.body);

    const result = await db.asUser(me, async (q) => {
      const cur = await loadMine(q, id);
      if (!cur) throw new HttpError(404, 'challenge_not_found');
      if (cur.creator_id !== me) throw new HttpError(403, 'not_creator');
      if (cur.status === 'ended') throw new HttpError(409, 'challenge_ended');

      const friends = (
        await q.query<{ user_id: string }>(
          `select user_id from my_relationships() where status = 'accepted' and user_id = any($1::uuid[])`,
          [user_ids],
        )
      ).rows.map((r) => r.user_id);
      const invited: string[] = [];
      for (const friend of friends) {
        const ins = await q.query(
          `insert into challenge_members (challenge_id, user_id, status) values ($1, $2, 'invited')
           on conflict (challenge_id, user_id) do nothing returning user_id`,
          [id, friend],
        );
        if (ins.rows.length) invited.push(friend);
      }
      return { invited, rejected: user_ids.filter((u) => !friends.includes(u)) };
    });
    await notifyChallenge(db, hub, id, result.invited);
    res.json({ invited: result.invited.length, rejected: result.rejected });
  });

  /** Moves my own membership state (RLS only ever lets me change my own row, and only forwards). */
  async function respond(req: Request, to: 'joined' | 'declined' | 'left') {
    const me = currentUserId(req);
    const { id } = idParam.parse(req.params);
    await db.asUser(me, async (q) => {
      const cur = await loadMine(q, id);
      if (!cur) throw new HttpError(404, 'challenge_not_found');
      if (to === 'joined') {
        if (cur.status === 'ended')
          throw new HttpError(409, 'challenge_ended', 'This challenge is over');
        if (cur.my_status === 'joined') return; // already in: nothing to do
      }
      if (to === 'declined' && cur.my_status !== 'invited') throw new HttpError(409, 'not_invited');
      if (to === 'left') {
        if (cur.creator_id === me)
          throw new HttpError(400, 'creator_cannot_leave', 'Delete the challenge instead');
        if (cur.my_status !== 'joined') throw new HttpError(409, 'not_a_member');
      }
      await q.query(
        `update challenge_members set status = $3 where challenge_id = $1 and user_id = $2`,
        [id, me, to],
      );
    });
    await notifyChallenge(db, hub, id, [me]);
    return id;
  }

  router.post('/:id/join', async (req, res) => {
    await respond(req, 'joined');
    res.status(204).end();
  });
  router.post('/:id/decline', async (req, res) => {
    await respond(req, 'declined');
    res.status(204).end();
  });
  router.post('/:id/leave', async (req, res) => {
    await respond(req, 'left');
    res.status(204).end();
  });

  return router;
}
