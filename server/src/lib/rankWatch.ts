import type { Db } from '../db.js';
import { pushToUser, type PushSender } from '../push.js';

// "A friend passed me": when someone's run changes the order of a leaderboard, the people they just
// overtook get a notification. Scores are updated by database triggers, so the order is read before
// and after the change and compared.

export type BoardSnapshot = Map<string, { title: string; order: string[] }>;

/** Active challenges the user is in, each with its members in rank order (value, then who got there first). */
export async function snapshotBoards(db: Db, userId: string): Promise<BoardSnapshot> {
  const rows = await db.asService(
    async (q) =>
      (
        await q.query<{ id: string; title: string; user_id: string }>(
          `select c.id, c.title, s.user_id
           from challenges c
           join challenge_members me on me.challenge_id = c.id and me.user_id = $1 and me.status = 'joined'
           join challenge_scores s on s.challenge_id = c.id
           where c.status = 'active'
           order by c.id, s.value desc, s.reached_at asc, s.user_id`,
          [userId],
        )
      ).rows,
  );
  const boards: BoardSnapshot = new Map();
  for (const r of rows) {
    const board = boards.get(r.id) ?? { title: r.title, order: [] };
    board.order.push(r.user_id);
    boards.set(r.id, board);
  }
  return boards;
}

export type Overtaken = { challengeId: string; title: string; userId: string };

/**
 * Members the actor moved ahead of. Someone counts only if the actor was behind them before AND is
 * ahead of them now, so a member who was already behind is not told, and neither is the actor when
 * they fall back (they did that themselves).
 */
export function findOvertaken(
  before: BoardSnapshot,
  after: BoardSnapshot,
  actor: string,
): Overtaken[] {
  const result: Overtaken[] = [];
  for (const [challengeId, board] of after) {
    const prev = before.get(challengeId)?.order;
    if (!prev) continue;
    const actorBefore = prev.indexOf(actor);
    const actorAfter = board.order.indexOf(actor);
    if (actorBefore === -1 || actorAfter === -1) continue;
    for (const member of board.order) {
      if (member === actor) continue;
      const memberBefore = prev.indexOf(member);
      if (memberBefore === -1) continue;
      const memberAfter = board.order.indexOf(member);
      if (actorBefore > memberBefore && actorAfter < memberAfter) {
        result.push({ challengeId, title: board.title, userId: member });
      }
    }
  }
  return result;
}

/** Call with the snapshot taken BEFORE the change, after the change has been committed. */
export async function notifyOvertaken(
  db: Db,
  push: PushSender,
  actorId: string,
  before: BoardSnapshot,
): Promise<void> {
  try {
    const after = await snapshotBoards(db, actorId);
    const passed = findOvertaken(before, after, actorId);
    if (passed.length === 0) return;
    const name = await db.asService(async (q) => {
      const r = await q.query<{ display_name: string | null; username: string }>(
        `select display_name, username from profiles where id = $1`,
        [actorId],
      );
      return r.rows[0]?.display_name || r.rows[0]?.username || 'A friend';
    });
    await Promise.all(
      passed.map((p) =>
        pushToUser(db, push, p.userId, 'leaderboard_passed', {
          title: `${name} passed you`,
          body: `${name} moved ahead of you in ${p.title}.`,
          data: { type: 'challenge', id: p.challengeId },
        }),
      ),
    );
  } catch (err) {
    console.error('notifyOvertaken failed', err);
  }
}
