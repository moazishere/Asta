import * as Crypto from 'expo-crypto';

import { estimateKcal, isSuspicious } from './geo';
import {
  countAcceptedPoints,
  createRun,
  deleteRun,
  finishRun,
  getRouteSince,
  getRun,
  pauseRun,
  resumeRun,
  type LocalRun,
} from './localDb';
import { useRunStore } from './runStore';
import { syncPendingRuns } from './sync';
import { startTracking, stopTracking } from './tracking';

// The only place that changes a run's lifecycle. It always writes the database first and mirrors the
// result into the store, so a crash at any moment leaves a consistent run on disk.

const store = () => useRunStore.getState();

export async function startRun(weightKg: number): Promise<void> {
  const id = Crypto.randomUUID();
  const now = Date.now();
  await createRun(id, now, weightKg);
  try {
    const mode = await startTracking(id);
    store().reset();
    store().apply({ phase: 'active', runId: id, startedAt: now, weightKg, mode });
  } catch (err) {
    await deleteRun(id); // do not leave a phantom "unfinished run" behind
    throw err;
  }
}

/** Pulls the latest totals and new route points from the database into the store (called every second). */
export async function refreshLive(): Promise<void> {
  const { runId, lastSeq } = store();
  if (!runId) return;
  const run = await getRun(runId);
  if (!run || run.status === 'finished') return;
  const fresh = await getRouteSince(runId, lastSeq);
  store().apply({
    distanceM: run.distance_m,
    movingMs: run.moving_ms,
    fixAt: run.fix_t,
    fixAcc: run.fix_acc,
    ...(fresh.length
      ? {
          route: [...store().route, ...fresh.map((p) => ({ latitude: p.lat, longitude: p.lng }))],
          lastSeq: fresh[fresh.length - 1]!.seq,
        }
      : {}),
  });
}

export async function pause(): Promise<void> {
  const { runId } = store();
  if (!runId) return;
  const now = Date.now();
  await refreshLive(); // capture everything recorded up to the pause
  await pauseRun(runId, now);
  await stopTracking(); // no GPS (and no foreground-service notification) while paused
  store().apply({ phase: 'paused', pauseStartedAt: now });
}

export async function resume(): Promise<void> {
  const { runId, pauseStartedAt, pausedTotalMs } = store();
  if (!runId) return;
  const now = Date.now();
  await resumeRun(runId, now);
  const mode = await startTracking(runId);
  store().apply({
    phase: 'active',
    pauseStartedAt: null,
    pausedTotalMs: pausedTotalMs + (pauseStartedAt ? now - pauseStartedAt : 0),
    mode,
  });
}

/**
 * Ends the run. Returns the run id, or null if there was too little GPS data to keep (the run is then
 * discarded). The upload is queued and attempted right away; if offline it retries later.
 */
export async function finish(endedAtOverride?: number): Promise<string | null> {
  const { runId } = store();
  if (!runId) return null;
  return finishById(runId, endedAtOverride);
}

async function finishById(runId: string, endedAtOverride?: number): Promise<string | null> {
  await stopTracking();
  if (store().runId === runId) await refreshLive();

  const run = await getRun(runId);
  if (!run) {
    store().reset();
    return null;
  }
  // The server needs at least two usable fixes to measure anything.
  if ((await countAcceptedPoints(runId)) < 2) {
    await deleteRun(runId);
    store().reset();
    return null;
  }
  const kcal = estimateKcal(run.weight_kg, run.distance_m);
  await finishRun(
    runId,
    endedAtOverride ?? Date.now(),
    kcal,
    isSuspicious(run.distance_m, run.moving_ms / 1000),
  );
  store().reset();
  void syncPendingRuns();
  return runId;
}

// ---- crash recovery ----------------------------------------------------------------------------

/** Rebuilds the in-memory view of an unfinished run found on disk. */
async function hydrate(run: LocalRun, mode: ReturnType<typeof store>['mode']) {
  const route = await getRouteSince(run.id, -1);
  store().apply({
    phase: run.status === 'paused' ? 'paused' : 'active',
    runId: run.id,
    startedAt: run.started_at,
    pausedTotalMs: run.paused_total_ms,
    pauseStartedAt: run.pause_started_at,
    distanceM: run.distance_m,
    movingMs: run.moving_ms,
    weightKg: run.weight_kg,
    fixAt: run.fix_t,
    fixAcc: run.fix_acc,
    route: route.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    lastSeq: route.length ? route[route.length - 1]!.seq : -1,
    mode,
  });
}

/** "Resume": continue the interrupted run. It starts a new segment so the gap is not counted as distance. */
export async function resumeRecovered(run: LocalRun): Promise<void> {
  await resumeRun(run.id, Date.now());
  const fresh = await getRun(run.id);
  const mode = await startTracking(run.id);
  await hydrate(fresh ?? run, mode);
}

/** "Save what we have": finish the interrupted run at the time of its last GPS fix. */
export async function saveRecovered(run: LocalRun): Promise<string | null> {
  return finishById(run.id, run.fix_t ?? run.last_t ?? Date.now());
}
