import type { Db } from './db.js';
import { notifyChallenge } from './lib/challengeEvents.js';
import { pushToUser, type PushSender } from './push.js';
import type { Hub } from './realtime.js';

export type ChallengeChange = { challenge_id: string; change: 'activated' | 'ended' };

/**
 * Moves challenges draft -> active at their start time and active -> ended at their end time (the
 * database function also does the final recompute and records the winner), then tells the members.
 * Idempotent: running it twice, or from two server instances, changes nothing the second time.
 */
export async function tickChallenges(
  db: Db,
  hub: Hub,
  push: PushSender,
): Promise<ChallengeChange[]> {
  const changes = await db.asService(
    async (q) =>
      (await q.query<ChallengeChange>(`select challenge_id, change from advance_challenges()`))
        .rows,
  );
  for (const c of changes) {
    await notifyChallenge(db, hub, c.challenge_id);
    if (c.change === 'ended') await pushChallengeEnded(db, push, c.challenge_id);
  }
  return changes;
}

/** Runs the tick once a minute inside the API process (replaces pg_cron: no database extension needed). */
export function startScheduler(
  db: Db,
  hub: Hub,
  push: PushSender,
  intervalMs = 60_000,
): () => void {
  const run = () =>
    tickChallenges(db, hub, push).catch((err) =>
      console.error('challenge scheduler tick failed', err),
    );
  void run(); // catch up straight away after a restart
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

/** "Challenge ended": the winner is told they won, everyone else who won. */
async function pushChallengeEnded(db: Db, push: PushSender, challengeId: string): Promise<void> {
  try {
    const info = await db.asService(async (q) => {
      const c = await q.query<{
        title: string;
        winner_id: string | null;
        winner_name: string | null;
      }>(
        `select c.title, c.winner_id, coalesce(p.display_name, p.username) as winner_name
         from challenges c left join profiles p on p.id = c.winner_id where c.id = $1`,
        [challengeId],
      );
      const m = await q.query<{ user_id: string }>(
        `select user_id from challenge_members where challenge_id = $1 and status = 'joined'`,
        [challengeId],
      );
      return { challenge: c.rows[0], members: m.rows.map((r) => r.user_id) };
    });
    if (!info.challenge) return;
    const { title, winner_id, winner_name } = info.challenge;
    await Promise.all(
      info.members.map((uid) =>
        pushToUser(db, push, uid, 'challenge_ended', {
          title: `${title} has ended`,
          body: !winner_id
            ? 'Nobody scored this time.'
            : uid === winner_id
              ? 'You won! Congratulations!'
              : `${winner_name ?? 'Someone'} won.`,
          data: { type: 'challenge', id: challengeId },
        }),
      ),
    );
  } catch (err) {
    console.error('pushChallengeEnded failed', err);
  }
}
