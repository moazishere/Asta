import { getAcceptedPoints, getPendingUploads, markUploaded, markUploadFailed } from './localDb';
import { ApiError, apiFetch } from '@/lib/api';
import { invalidateRunData } from '@/lib/queryClient';

type ServerRun = {
  id: string;
  distance_m: number;
  moving_time_s: number;
  kcal_est: number | null;
  suspicious: boolean;
};

// Errors that retrying cannot fix (the server understood the request and refused it). Everything else
// (offline, 5xx, expired login, rate limit) is temporary: keep the run queued and try again later.
const isPermanent = (e: ApiError) =>
  e.status >= 400 && e.status < 500 && ![401, 408, 429].includes(e.status);

let running = false;

/**
 * Uploads every finished run that is not on the server yet, oldest first, in one request each.
 * The run id is generated on the phone, so a retry after a lost response can never create a duplicate.
 * Returns how many runs were uploaded. Safe to call at any time (start, foreground, after a run).
 */
export async function syncPendingRuns(): Promise<number> {
  if (running) return 0;
  running = true;
  let uploaded = 0;
  try {
    for (const run of await getPendingUploads()) {
      const points = await getAcceptedPoints(run.id);
      try {
        const saved = await apiFetch<ServerRun>('/runs', {
          method: 'POST',
          body: {
            id: run.id,
            startedAt: new Date(run.started_at).toISOString(),
            endedAt: new Date(run.ended_at ?? run.started_at).toISOString(),
            movingTimeS: Math.floor(run.moving_ms / 1000),
            points,
          },
        });
        await markUploaded(run.id, saved);
        uploaded++;
      } catch (err) {
        if (err instanceof ApiError && isPermanent(err)) {
          await markUploadFailed(run.id, err.code);
          continue;
        }
        break; // offline or server trouble: stop, keep the queue order, retry on the next trigger
      }
    }
  } finally {
    running = false;
  }
  // New runs on the server: the history list and weekly totals are now out of date.
  if (uploaded > 0) invalidateRunData();
  return uploaded;
}
