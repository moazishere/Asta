import type { Db } from '../db.js';
import type { Hub } from '../realtime.js';

// Fan-out of "something changed" hints to challenge members over the WebSocket. These queries run as
// the service role because they must find the OTHER members of a challenge (someone who just left can
// no longer read them) and they return nothing but ids: no scores, names or calories ever leave here.
// The app reacts to a hint by refetching through the normal, authorised API.

type Row = { challenge_id: string; user_id: string };

function fanOut(hub: Hub, rows: Row[]) {
  for (const r of rows)
    hub.publish(r.user_id, { type: 'leaderboard', challengeId: r.challenge_id });
}

/** A member's run or food log changed: tell everyone in their ACTIVE challenges to refresh the board. */
export async function notifyUserChallenges(db: Db, hub: Hub, userId: string): Promise<void> {
  try {
    const rows = await db.asService(
      async (q) =>
        (
          await q.query<Row>(
            `select m2.challenge_id, m2.user_id
             from challenge_members m1
             join challenges c on c.id = m1.challenge_id and c.status = 'active'
             join challenge_members m2 on m2.challenge_id = c.id and m2.status = 'joined'
             where m1.user_id = $1 and m1.status = 'joined'`,
            [userId],
          )
        ).rows,
    );
    fanOut(hub, rows);
  } catch (err) {
    // A failed hint must never fail the request that caused it: the app also refetches on its own.
    console.error('notifyUserChallenges failed', err);
  }
}

/**
 * The membership or status of one challenge changed (join, leave, start, end): refresh its members'
 * boards, and tell the people involved to refresh their challenge lists.
 */
export async function notifyChallenge(
  db: Db,
  hub: Hub,
  challengeId: string,
  alsoNotify: string[] = [],
): Promise<void> {
  try {
    const rows = await db.asService(
      async (q) =>
        (
          await q.query<Row & { status: string }>(
            `select challenge_id, user_id, status from challenge_members
             where challenge_id = $1 and status in ('joined', 'invited')`,
            [challengeId],
          )
        ).rows,
    );
    fanOut(
      hub,
      rows.filter((r) => r.status === 'joined'),
    );
    for (const id of new Set([...rows.map((r) => r.user_id), ...alsoNotify])) {
      hub.publish(id, { type: 'challenges' });
    }
  } catch (err) {
    console.error('notifyChallenge failed', err);
  }
}
