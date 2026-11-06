import type { Db } from './db.js';
import { notifyChallenge } from './lib/challengeEvents.js';
import type { Hub } from './realtime.js';

export type ChallengeChange = { challenge_id: string; change: 'activated' | 'ended' };

/**
 * Moves challenges draft -> active at their start time and active -> ended at their end time (the
 * database function also does the final recompute and records the winner), then tells the members.
 * Idempotent: running it twice, or from two server instances, changes nothing the second time.
 */
export async function tickChallenges(db: Db, hub: Hub): Promise<ChallengeChange[]> {
  const changes = await db.asService(
    async (q) =>
      (await q.query<ChallengeChange>(`select challenge_id, change from advance_challenges()`))
        .rows,
  );
  for (const c of changes) await notifyChallenge(db, hub, c.challenge_id);
  return changes;
}

/** Runs the tick once a minute inside the API process (replaces pg_cron: no database extension needed). */
export function startScheduler(db: Db, hub: Hub, intervalMs = 60_000): () => void {
  const run = () =>
    tickChallenges(db, hub).catch((err) => console.error('challenge scheduler tick failed', err));
  void run(); // catch up straight away after a restart
  const timer = setInterval(run, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
