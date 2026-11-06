import { useEffect, useState } from 'react';

import { elapsedMs } from './geo';
import { refreshLive } from './runController';
import { useRunStore } from './runStore';

/**
 * Once per second while a run is active or paused: refreshes the store from the database.
 * @param enabled false while the Run screen is not visible: the run itself keeps recording into the
 * database, and there is nothing to redraw (or battery to spend) until the user comes back.
 */
export function useRunTicker(enabled = true): number {
  const phase = useRunStore((s) => s.phase);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (phase === 'idle' || !enabled) return;
    const id = setInterval(() => {
      setNow(Date.now());
      void refreshLive();
    }, 1000);
    return () => clearInterval(id);
  }, [phase, enabled]);
  return now;
}

export function useElapsedSeconds(now: number): number {
  const startedAt = useRunStore((s) => s.startedAt);
  const pausedTotalMs = useRunStore((s) => s.pausedTotalMs);
  const pauseStartedAt = useRunStore((s) => s.pauseStartedAt);
  return Math.floor(elapsedMs({ startedAt, pausedTotalMs, pauseStartedAt, now }) / 1000);
}

export type GpsTone = 'good' | 'weak' | 'searching';

/** Good = a recent, accurate fix. With distance-based sampling, silence for a while is normal when stopped. */
export function gpsTone(now: number, fixAt: number | null, fixAcc: number | null): GpsTone {
  if (fixAt == null) return 'searching';
  if (fixAcc != null && fixAcc > 20) return 'weak';
  return now - fixAt > 30_000 ? 'weak' : 'good';
}
