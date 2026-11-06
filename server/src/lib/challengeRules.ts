export type ChallengeType = 'distance' | 'run_count' | 'kcal_streak';

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

export const LIMITS = {
  /** A challenge may start "now": allow a little clock slack on the phone. */
  startSlackMs: 5 * 60_000,
  maxStartInDays: 180,
  minDurationMs: HOUR_MS,
  maxDurationDays: 90,
  distanceM: { min: 1_000, max: 10_000_000 },
  runCount: { min: 1, max: 1_000 },
} as const;

type Input = { type: ChallengeType; target_value: number; starts_at: string; ends_at: string };

/**
 * Checks a challenge definition. Returns a message describing the first problem, or null if it is valid.
 * Units: distance in METRES, run_count in runs, kcal_streak in days.
 */
export function validateChallenge(input: Input, now: Date = new Date()): string | null {
  const start = Date.parse(input.starts_at);
  const end = Date.parse(input.ends_at);
  if (Number.isNaN(start) || Number.isNaN(end)) return 'Invalid dates';

  if (start < now.getTime() - LIMITS.startSlackMs) return 'The start cannot be in the past';
  if (start > now.getTime() + LIMITS.maxStartInDays * DAY_MS)
    return 'The start is too far in the future';
  const duration = end - start;
  if (duration < LIMITS.minDurationMs) return 'A challenge must last at least one hour';
  if (duration > LIMITS.maxDurationDays * DAY_MS)
    return `A challenge cannot last more than ${LIMITS.maxDurationDays} days`;

  const t = input.target_value;
  switch (input.type) {
    case 'distance':
      if (t < LIMITS.distanceM.min || t > LIMITS.distanceM.max)
        return 'Distance target must be between 1 km and 10,000 km';
      return null;
    case 'run_count':
      if (!Number.isInteger(t) || t < LIMITS.runCount.min || t > LIMITS.runCount.max)
        return 'Run target must be a whole number from 1 to 1000';
      return null;
    case 'kcal_streak': {
      const days = Math.ceil(duration / DAY_MS);
      if (!Number.isInteger(t) || t < 1) return 'Day target must be a whole number of at least 1';
      if (t > days) return 'The day target cannot be more than the number of days in the challenge';
      return null;
    }
  }
}
