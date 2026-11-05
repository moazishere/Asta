import * as SQLite from 'expo-sqlite';

import { applyFix, type Fix, type TrackState } from './geo';

// The phone's own copy of a run. EVERY GPS fix is written here the moment it arrives (never kept only
// in memory), so a crash, a killed app or a dead battery loses at most the last second. The server
// upload happens afterwards, from this data.

export type RunStatus = 'active' | 'paused' | 'finished';

export type LocalRun = {
  id: string;
  status: RunStatus;
  started_at: number;
  ended_at: number | null;
  /** Current segment: +1 on every resume/recovery, so gaps are never measured as distance. */
  segment: number;
  paused_total_ms: number;
  pause_started_at: number | null;
  distance_m: number;
  moving_ms: number;
  next_seq: number;
  weight_kg: number;
  // Last ACCEPTED fix: the next fix is measured from here.
  last_lat: number | null;
  last_lng: number | null;
  last_t: number | null;
  last_acc: number | null;
  last_seg: number | null;
  // Latest fix of any kind (even rejected), used for the GPS signal indicator.
  fix_t: number | null;
  fix_acc: number | null;
  kcal: number | null;
  suspicious: number;
  uploaded_at: number | null;
  upload_error: string | null;
};

export type LocalPoint = {
  seq: number;
  t: number;
  lat: number;
  lng: number;
  alt: number | null;
  acc: number | null;
  spd: number | null;
  seg: number;
};

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export function getDb() {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('asta-runs.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS local_runs (
        id TEXT PRIMARY KEY NOT NULL,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        segment INTEGER NOT NULL DEFAULT 0,
        paused_total_ms INTEGER NOT NULL DEFAULT 0,
        pause_started_at INTEGER,
        distance_m REAL NOT NULL DEFAULT 0,
        moving_ms INTEGER NOT NULL DEFAULT 0,
        next_seq INTEGER NOT NULL DEFAULT 0,
        weight_kg REAL NOT NULL,
        last_lat REAL, last_lng REAL, last_t INTEGER, last_acc REAL, last_seg INTEGER,
        fix_t INTEGER, fix_acc REAL,
        kcal INTEGER,
        suspicious INTEGER NOT NULL DEFAULT 0,
        uploaded_at INTEGER,
        upload_error TEXT
      );
      CREATE TABLE IF NOT EXISTS local_points (
        run_id TEXT NOT NULL,
        seq INTEGER NOT NULL,
        t INTEGER NOT NULL,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        alt REAL,
        acc REAL,
        spd REAL,
        seg INTEGER NOT NULL,
        accepted INTEGER NOT NULL,
        PRIMARY KEY (run_id, seq)
      );
    `);
    return db;
  })();
  return dbPromise;
}

// Location callbacks can overlap (foreground watcher + background task, or two batches back to back).
// Every write goes through this queue so read-modify-write cycles on a run never interleave.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = queue.then(fn, fn);
  queue = next.catch(() => undefined);
  return next;
}

// ---- runs --------------------------------------------------------------------------------------

export async function createRun(id: string, startedAt: number, weightKg: number): Promise<void> {
  const db = await getDb();
  await serial(() =>
    db.runAsync(
      `INSERT INTO local_runs (id, status, started_at, weight_kg) VALUES (?, 'active', ?, ?)`,
      id,
      startedAt,
      weightKg,
    ),
  );
}

export async function getRun(id: string): Promise<LocalRun | null> {
  const db = await getDb();
  return db.getFirstAsync<LocalRun>(`SELECT * FROM local_runs WHERE id = ?`, id);
}

/** A run that was started but never finished (app crash, kill, dead battery). */
export async function getUnfinishedRun(): Promise<LocalRun | null> {
  const db = await getDb();
  return db.getFirstAsync<LocalRun>(
    `SELECT * FROM local_runs WHERE status IN ('active', 'paused') ORDER BY started_at DESC LIMIT 1`,
  );
}

export async function pauseRun(id: string, now: number): Promise<void> {
  const db = await getDb();
  await serial(() =>
    db.runAsync(
      `UPDATE local_runs SET status = 'paused', pause_started_at = ? WHERE id = ? AND status = 'active'`,
      now,
      id,
    ),
  );
}

/** Resuming (or recovering after a crash) starts a NEW segment. */
export async function resumeRun(id: string, now: number): Promise<void> {
  const db = await getDb();
  await serial(() =>
    db.runAsync(
      `UPDATE local_runs
         SET status = 'active',
             paused_total_ms = paused_total_ms + CASE WHEN pause_started_at IS NULL THEN 0 ELSE ? - pause_started_at END,
             pause_started_at = NULL,
             segment = segment + 1
       WHERE id = ? AND status IN ('active', 'paused')`,
      now,
      id,
    ),
  );
}

export async function finishRun(
  id: string,
  endedAt: number,
  kcal: number,
  suspicious: boolean,
): Promise<void> {
  const db = await getDb();
  await serial(() =>
    db.runAsync(
      `UPDATE local_runs
         SET status = 'finished',
             ended_at = ?,
             paused_total_ms = paused_total_ms + CASE WHEN pause_started_at IS NULL THEN 0 ELSE ? - pause_started_at END,
             pause_started_at = NULL,
             kcal = ?,
             suspicious = ?
       WHERE id = ?`,
      endedAt,
      endedAt,
      kcal,
      suspicious ? 1 : 0,
      id,
    ),
  );
}

export async function deleteRun(id: string): Promise<void> {
  const db = await getDb();
  await serial(async () => {
    await db.runAsync(`DELETE FROM local_points WHERE run_id = ?`, id);
    await db.runAsync(`DELETE FROM local_runs WHERE id = ?`, id);
  });
}

// ---- points ------------------------------------------------------------------------------------

export type RawFix = Fix & { alt: number | null; spd: number | null };

/**
 * Stores a batch of GPS fixes for an active run and updates its running totals, all in ONE
 * transaction. Rejected fixes (inaccurate, jumps) are stored too, flagged accepted = 0.
 */
export async function ingestFixes(runId: string, fixes: Omit<RawFix, 'segment'>[]): Promise<void> {
  if (fixes.length === 0) return;
  const db = await getDb();
  await serial(() =>
    db.withTransactionAsync(async () => {
      const run = await db.getFirstAsync<LocalRun>(`SELECT * FROM local_runs WHERE id = ?`, runId);
      // Late deliveries after pause/stop must not leak into the run.
      if (!run || run.status !== 'active') return;

      let state: TrackState = {
        distanceM: run.distance_m,
        movingMs: run.moving_ms,
        last:
          run.last_t == null || run.last_lat == null || run.last_lng == null
            ? null
            : {
                lat: run.last_lat,
                lng: run.last_lng,
                t: run.last_t,
                accuracy: run.last_acc,
                segment: run.last_seg ?? 0,
              },
      };
      let seq = run.next_seq;
      let fixT = run.fix_t;
      let fixAcc = run.fix_acc;

      for (const f of [...fixes].sort((a, b) => a.t - b.t)) {
        const fix: Fix = {
          lat: f.lat,
          lng: f.lng,
          t: f.t,
          accuracy: f.accuracy,
          segment: run.segment,
        };
        const result = applyFix(state, fix);
        state = result.state;
        await db.runAsync(
          `INSERT INTO local_points (run_id, seq, t, lat, lng, alt, acc, spd, seg, accepted)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          runId,
          seq++,
          f.t,
          f.lat,
          f.lng,
          f.alt,
          f.accuracy,
          f.spd,
          run.segment,
          result.verdict === 'accepted' ? 1 : 0,
        );
        fixT = f.t;
        fixAcc = f.accuracy;
      }

      await db.runAsync(
        `UPDATE local_runs SET distance_m = ?, moving_ms = ?, next_seq = ?,
           last_lat = ?, last_lng = ?, last_t = ?, last_acc = ?, last_seg = ?, fix_t = ?, fix_acc = ? WHERE id = ?`,
        state.distanceM,
        state.movingMs,
        seq,
        state.last?.lat ?? null,
        state.last?.lng ?? null,
        state.last?.t ?? null,
        state.last?.accuracy ?? null,
        state.last?.segment ?? null,
        fixT,
        fixAcc,
        runId,
      );
    }),
  );
}

/** Accepted route points after `afterSeq`, for drawing the live map incrementally. */
export async function getRouteSince(runId: string, afterSeq: number) {
  const db = await getDb();
  return db.getAllAsync<{ seq: number; lat: number; lng: number }>(
    `SELECT seq, lat, lng FROM local_points WHERE run_id = ? AND accepted = 1 AND seq > ? ORDER BY seq`,
    runId,
    afterSeq,
  );
}

export async function getAcceptedPoints(runId: string): Promise<LocalPoint[]> {
  const db = await getDb();
  return db.getAllAsync<LocalPoint>(
    `SELECT seq, t, lat, lng, alt, acc, spd, seg FROM local_points WHERE run_id = ? AND accepted = 1 ORDER BY seq`,
    runId,
  );
}

export async function countAcceptedPoints(runId: string): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM local_points WHERE run_id = ? AND accepted = 1`,
    runId,
  );
  return row?.n ?? 0;
}

// ---- upload queue ------------------------------------------------------------------------------

export async function getPendingUploads(): Promise<LocalRun[]> {
  const db = await getDb();
  return db.getAllAsync<LocalRun>(
    `SELECT * FROM local_runs WHERE status = 'finished' AND uploaded_at IS NULL AND upload_error IS NULL ORDER BY started_at`,
  );
}

export async function markUploaded(
  id: string,
  server: {
    distance_m: number;
    moving_time_s: number;
    kcal_est: number | null;
    suspicious: boolean;
  },
): Promise<void> {
  const db = await getDb();
  await serial(() =>
    db.runAsync(
      // The server re-derives these from the raw points, so its numbers become the official ones.
      `UPDATE local_runs SET uploaded_at = ?, distance_m = ?, moving_ms = ?, kcal = COALESCE(?, kcal), suspicious = ?, upload_error = NULL WHERE id = ?`,
      Date.now(),
      server.distance_m,
      server.moving_time_s * 1000,
      server.kcal_est,
      server.suspicious ? 1 : 0,
      id,
    ),
  );
}

/** Permanent failure (the server will never accept this run): stop retrying. */
export async function markUploadFailed(id: string, message: string): Promise<void> {
  const db = await getDb();
  await serial(() =>
    db.runAsync(`UPDATE local_runs SET upload_error = ? WHERE id = ?`, message, id),
  );
}

/** Uploaded runs keep their GPS points for a while (for the summary screen), then are cleaned up. */
export async function pruneOldRuns(olderThanMs = 30 * 24 * 3600 * 1000): Promise<void> {
  const db = await getDb();
  const cutoff = Date.now() - olderThanMs;
  await serial(async () => {
    await db.runAsync(
      `DELETE FROM local_points WHERE run_id IN (SELECT id FROM local_runs WHERE uploaded_at IS NOT NULL AND uploaded_at < ?)`,
      cutoff,
    );
    await db.runAsync(
      `DELETE FROM local_runs WHERE uploaded_at IS NOT NULL AND uploaded_at < ?`,
      cutoff,
    );
  });
}
