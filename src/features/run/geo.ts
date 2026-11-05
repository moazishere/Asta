// Pure run maths: no React, no native modules, so it can be unit tested with plain Node.
// (The server re-derives distance from the same rules in server/src/lib/geo.ts and does not trust
// the phone, so keep the constants and the filtering logic in sync with that file.)

export type LatLng = { latitude: number; longitude: number };

export type Fix = {
  lat: number;
  lng: number;
  /** Epoch milliseconds of the GPS fix. */
  t: number;
  accuracy: number | null;
  /** Bumps by one on every resume after a pause or crash recovery. */
  segment: number;
};

/** Fixes less accurate than this (radius in metres) are discarded. */
export const MAX_ACCURACY_M = 30;
/** Fixes implying a faster speed than this since the previous one are GPS jumps (43 km/h). */
export const MAX_SPEED_MPS = 12;
/** Slower than this between two fixes counts as standing still: the time is not "moving time". */
export const MIN_MOVING_SPEED_MPS = 0.5;
/** Runs averaging more than this are flagged as suspicious (car/bike). */
export const SUSPICIOUS_AVG_KMH = 20;

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres between two coordinates. */
export function haversineM(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type TrackState = {
  distanceM: number;
  movingMs: number;
  /** The last ACCEPTED fix, which the next one is measured against. */
  last: Fix | null;
};

export type Verdict = 'accepted' | 'inaccurate' | 'jump' | 'stale';

export const emptyTrack: TrackState = { distanceM: 0, movingMs: 0, last: null };

/**
 * Feeds one GPS fix into the running totals. Returns the new state (unchanged if the fix was
 * rejected) and why. Distance is never measured across a segment change (pause/recovery).
 */
export function applyFix(state: TrackState, fix: Fix): { state: TrackState; verdict: Verdict } {
  if (fix.accuracy != null && (fix.accuracy < 0 || fix.accuracy > MAX_ACCURACY_M)) {
    return { state, verdict: 'inaccurate' };
  }
  const prev = state.last;
  if (!prev || prev.segment !== fix.segment) {
    return { state: { ...state, last: fix }, verdict: 'accepted' };
  }
  const dtMs = fix.t - prev.t;
  if (dtMs <= 0) return { state, verdict: 'stale' };

  const leg = haversineM(prev, fix);
  const speed = leg / (dtMs / 1000);
  if (speed > MAX_SPEED_MPS) return { state, verdict: 'jump' };

  return {
    state: {
      distanceM: state.distanceM + leg,
      // Standing still (red light, tying shoes) adds distance noise at most, but no moving time.
      movingMs: state.movingMs + (speed >= MIN_MOVING_SPEED_MPS ? dtMs : 0),
      last: fix,
    },
    verdict: 'accepted',
  };
}

/** Seconds per km, or null when there is not enough distance for a meaningful number. */
export function paceSecPerKm(distanceM: number, movingMs: number): number | null {
  if (distanceM < 10 || movingMs <= 0) return null;
  return movingMs / 1000 / (distanceM / 1000);
}

/** Rough running rule of thumb: about 1 kcal per kg of body weight per km. It is only an estimate. */
export function estimateKcal(weightKg: number, distanceM: number): number {
  return Math.round(weightKg * (distanceM / 1000));
}

export function isSuspicious(distanceM: number, movingS: number): boolean {
  if (movingS <= 0) return false;
  return (distanceM / movingS) * 3.6 > SUSPICIOUS_AVG_KMH;
}

/** Wall-clock time excluding paused periods. */
export function elapsedMs(run: {
  startedAt: number;
  pausedTotalMs: number;
  pauseStartedAt: number | null;
  now: number;
}): number {
  const currentPause = run.pauseStartedAt == null ? 0 : run.now - run.pauseStartedAt;
  return Math.max(0, run.now - run.startedAt - run.pausedTotalMs - currentPause);
}

// ---- formatting -------------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');

/** 3725 -> "1:02:05", 125 -> "02:05". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** 342 s/km -> "5:42". Null (no pace yet) -> "--:--". */
export function formatPace(secPerKm: number | null): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--';
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

export function formatKm(distanceM: number): string {
  return (distanceM / 1000).toFixed(2);
}
