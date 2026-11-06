// Pure challenge helpers: no React, no native modules, unit tested.
import type { ChallengeStatus, ChallengeSummary, ChallengeType } from './types';

/** What the user types in the create form, converted to the stored unit (metres / runs / days). */
export function toTargetValue(type: ChallengeType, input: number): number {
  return type === 'distance' ? Math.round(input * 1000) : Math.round(input);
}

/** The inverse of toTargetValue, for editing and display: km / runs / days. */
export function fromTargetValue(type: ChallengeType, stored: number): number {
  return type === 'distance' ? stored / 1000 : stored;
}

export type UnitKey = 'units.km' | 'challenges.unitRuns' | 'challenges.unitDays';

export const unitKey = (type: ChallengeType): UnitKey =>
  type === 'distance'
    ? 'units.km'
    : type === 'run_count'
      ? 'challenges.unitRuns'
      : 'challenges.unitDays';

/** "12.34" km, "5" runs, "5" days. */
export function formatAmount(type: ChallengeType, value: number): string {
  if (type === 'distance') {
    const km = value / 1000;
    // Whole kilometres without ".00" are easier to read on a target ("50 km").
    return Number.isInteger(km) ? String(km) : km.toFixed(2);
  }
  return String(Math.round(value));
}

/** 0..1, capped at a full bar; 0 for a missing or non-positive target. */
export function progress(value: number | null, target: number): number {
  if (value == null || target <= 0) return 0;
  return Math.min(1, Math.max(0, value / target));
}

export type Phase = 'upcoming' | 'active' | 'ended';

/** Where a challenge is in time, from its dates (the server's status can lag by up to a minute). */
export function phaseAt(
  startsAt: string,
  endsAt: string,
  now: number,
): { phase: Phase; ms: number } {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (now < start) return { phase: 'upcoming', ms: start - now };
  if (now < end) return { phase: 'active', ms: end - now };
  return { phase: 'ended', ms: now - end };
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "3d 4h", "5h 12m", "12m", or "<1m". The unit letters are passed in so they can be translated. */
export function formatDuration(
  ms: number,
  units: { d: string; h: string; m: string; lessThanMinute: string },
): string {
  const total = Math.max(0, ms);
  if (total < MINUTE) return units.lessThanMinute;
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  if (days > 0) return hours > 0 ? `${days}${units.d} ${hours}${units.h}` : `${days}${units.d}`;
  if (hours > 0)
    return minutes > 0 ? `${hours}${units.h} ${minutes}${units.m}` : `${hours}${units.h}`;
  return `${minutes}${units.m}`;
}

export type Grouped = {
  invitations: ChallengeSummary[];
  active: ChallengeSummary[];
  upcoming: ChallengeSummary[];
  finished: ChallengeSummary[];
};

/**
 * Sorts my challenges into the screen's sections. Invitations to challenges that are already over are
 * dropped (nothing can be done with them). Active: soonest to end first. Upcoming: soonest to start.
 * Finished: most recently ended first.
 */
export function groupChallenges(list: ChallengeSummary[]): Grouped {
  const byStatus = (s: ChallengeStatus, mine: 'joined') =>
    list.filter((c) => c.my_status === mine && c.status === s);
  return {
    invitations: list.filter((c) => c.my_status === 'invited' && c.status !== 'ended'),
    active: byStatus('active', 'joined').sort(
      (a, b) => Date.parse(a.ends_at) - Date.parse(b.ends_at),
    ),
    upcoming: byStatus('draft', 'joined').sort(
      (a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at),
    ),
    finished: byStatus('ended', 'joined').sort(
      (a, b) => Date.parse(b.ends_at) - Date.parse(a.ends_at),
    ),
  };
}

export type StartOption = 'now' | 'tomorrow' | 'monday';

/**
 * Start and end for the create form. "Tomorrow" and "Monday" start at 00:00 on the phone's local
 * calendar; the end is `durationDays` full days after the start.
 */
export function windowFor(
  start: StartOption,
  durationDays: number,
  now: Date = new Date(),
): { starts_at: string; ends_at: string } {
  const begin = new Date(now);
  if (start === 'tomorrow') {
    begin.setDate(begin.getDate() + 1);
    begin.setHours(0, 0, 0, 0);
  } else if (start === 'monday') {
    const toMonday = (8 - begin.getDay()) % 7 || 7; // always the NEXT Monday, never today
    begin.setDate(begin.getDate() + toMonday);
    begin.setHours(0, 0, 0, 0);
  }
  const end = new Date(begin);
  end.setDate(end.getDate() + durationDays);
  return { starts_at: begin.toISOString(), ends_at: end.toISOString() };
}
