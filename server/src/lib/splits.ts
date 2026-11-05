import { haversineM, MIN_MOVING_SPEED_MPS, type GeoPoint } from './geo.js';

export type Split = {
  /** 1-based kilometre number. The last split may be shorter than a full kilometre. */
  km: number;
  distance_m: number;
  duration_s: number;
  /** Seconds per km over this split, or null if it is too short to mean anything. */
  pace_s_per_km: number | null;
};

const SPLIT_M = 1000;
const MIN_PACE_DISTANCE_M = 50;

/**
 * Kilometre splits of a cleaned track. A leg that crosses a kilometre boundary is divided in
 * proportion, so splits are exact. Pauses are skipped and standing still adds no time, exactly like
 * movingTimeMs(), so the durations add up to the run's moving time and the distances to its distance.
 */
export function computeSplits(points: GeoPoint[]): Split[] {
  const splits: Split[] = [];
  let distance = 0; // metres in the split being built
  let timeMs = 0; // moving milliseconds in the split being built

  const push = () => {
    const seconds = timeMs / 1000;
    splits.push({
      km: splits.length + 1,
      distance_m: Math.round(distance * 10) / 10,
      duration_s: Math.round(seconds * 10) / 10,
      pace_s_per_km:
        distance >= MIN_PACE_DISTANCE_M && seconds > 0
          ? Math.round((seconds / distance) * 1000)
          : null,
    });
    distance = 0;
    timeMs = 0;
  };

  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.segment !== b.segment) continue;
    const dt = b.t - a.t;
    const leg = haversineM(a, b);
    if (dt <= 0 || leg === 0) continue;
    const legMs = leg / (dt / 1000) >= MIN_MOVING_SPEED_MPS ? dt : 0;

    let remaining = leg;
    while (remaining > 0) {
      const room = SPLIT_M - distance;
      const part = Math.min(remaining, room);
      distance += part;
      timeMs += legMs * (part / leg);
      remaining -= part;
      if (distance >= SPLIT_M - 1e-9) push();
    }
  }
  if (distance > 0) push();
  return splits;
}
