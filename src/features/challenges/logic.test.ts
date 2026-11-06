import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  formatAmount,
  formatDuration,
  fromTargetValue,
  groupChallenges,
  phaseAt,
  progress,
  toTargetValue,
  unitKey,
  windowFor,
} from './logic';
import type { ChallengeSummary } from './types';

const units = { d: 'd', h: 'h', m: 'm', lessThanMinute: '<1m' };

const challenge = (over: Partial<ChallengeSummary>): ChallengeSummary => ({
  id: 'c',
  title: 'T',
  type: 'distance',
  target_value: 10_000,
  starts_at: '2026-11-01T00:00:00Z',
  ends_at: '2026-11-08T00:00:00Z',
  status: 'active',
  my_status: 'joined',
  creator: null,
  member_count: 2,
  my_value: 0,
  my_rank: 1,
  ...over,
});

describe('target units', () => {
  it('converts the form input to the stored unit and back', () => {
    assert.equal(toTargetValue('distance', 50), 50_000);
    assert.equal(toTargetValue('distance', 12.345), 12_345);
    assert.equal(toTargetValue('run_count', 7), 7);
    assert.equal(toTargetValue('kcal_streak', 5), 5);
    assert.equal(fromTargetValue('distance', 50_000), 50);
    assert.equal(fromTargetValue('run_count', 7), 7);
  });
  it('picks the right unit label', () => {
    assert.equal(unitKey('distance'), 'units.km');
    assert.equal(unitKey('run_count'), 'challenges.unitRuns');
    assert.equal(unitKey('kcal_streak'), 'challenges.unitDays');
  });
});

describe('formatAmount', () => {
  it('shows kilometres with two decimals, but whole numbers plainly', () => {
    assert.equal(formatAmount('distance', 12_340), '12.34');
    assert.equal(formatAmount('distance', 50_000), '50');
    assert.equal(formatAmount('distance', 0), '0');
    assert.equal(formatAmount('distance', 999), '1.00');
  });
  it('shows runs and days as whole numbers', () => {
    assert.equal(formatAmount('run_count', 5), '5');
    assert.equal(formatAmount('kcal_streak', 3), '3');
  });
});

describe('progress', () => {
  it('is value / target, capped at 1', () => {
    assert.equal(progress(2500, 10_000), 0.25);
    assert.equal(progress(20_000, 10_000), 1);
    assert.equal(progress(0, 10_000), 0);
  });
  it('is 0 without a value or a usable target', () => {
    assert.equal(progress(null, 10_000), 0);
    assert.equal(progress(5, 0), 0);
    assert.equal(progress(-3, 10), 0);
  });
});

describe('phaseAt', () => {
  const start = '2026-11-10T00:00:00Z';
  const end = '2026-11-17T00:00:00Z';
  const at = (iso: string) => Date.parse(iso);
  it('knows upcoming, active and ended, with the time to or since the boundary', () => {
    assert.deepEqual(phaseAt(start, end, at('2026-11-09T12:00:00Z')), {
      phase: 'upcoming',
      ms: 12 * 3600_000,
    });
    assert.deepEqual(phaseAt(start, end, at('2026-11-16T00:00:00Z')), {
      phase: 'active',
      ms: 24 * 3600_000,
    });
    assert.deepEqual(phaseAt(start, end, at('2026-11-18T00:00:00Z')), {
      phase: 'ended',
      ms: 24 * 3600_000,
    });
  });
  it('treats the start as active and the end as ended (matching the server window)', () => {
    assert.equal(phaseAt(start, end, at(start)).phase, 'active');
    assert.equal(phaseAt(start, end, at(end)).phase, 'ended');
  });
});

describe('formatDuration', () => {
  it('shows the two most significant units', () => {
    assert.equal(formatDuration(3 * 86_400_000 + 4 * 3_600_000 + 59_000, units), '3d 4h');
    assert.equal(formatDuration(5 * 3_600_000 + 12 * 60_000, units), '5h 12m');
    assert.equal(formatDuration(12 * 60_000, units), '12m');
  });
  it('omits a zero second unit and floors sub-minute values', () => {
    assert.equal(formatDuration(2 * 86_400_000, units), '2d');
    assert.equal(formatDuration(3 * 3_600_000, units), '3h');
    assert.equal(formatDuration(59_999, units), '<1m');
    assert.equal(formatDuration(-5, units), '<1m');
  });
});

describe('groupChallenges', () => {
  it('sorts challenges into invitations, active, upcoming and finished', () => {
    const g = groupChallenges([
      challenge({ id: 'a2', ends_at: '2026-11-20T00:00:00Z' }),
      challenge({ id: 'a1', ends_at: '2026-11-09T00:00:00Z' }),
      challenge({ id: 'u2', status: 'draft', starts_at: '2026-12-10T00:00:00Z' }),
      challenge({ id: 'u1', status: 'draft', starts_at: '2026-12-01T00:00:00Z' }),
      challenge({ id: 'f1', status: 'ended', ends_at: '2026-10-01T00:00:00Z' }),
      challenge({ id: 'f2', status: 'ended', ends_at: '2026-10-20T00:00:00Z' }),
      challenge({ id: 'i1', my_status: 'invited', status: 'draft' }),
      challenge({ id: 'i2', my_status: 'invited', status: 'ended' }),
    ]);
    assert.deepEqual(
      g.active.map((c) => c.id),
      ['a1', 'a2'],
    );
    assert.deepEqual(
      g.upcoming.map((c) => c.id),
      ['u1', 'u2'],
    );
    assert.deepEqual(
      g.finished.map((c) => c.id),
      ['f2', 'f1'],
    );
    assert.deepEqual(
      g.invitations.map((c) => c.id),
      ['i1'],
      'an invitation to an ended challenge is hidden',
    );
  });
  it('does not show invited challenges as active', () => {
    const g = groupChallenges([challenge({ my_status: 'invited', status: 'active' })]);
    assert.equal(g.active.length, 0);
    assert.equal(g.invitations.length, 1);
  });
});

describe('windowFor', () => {
  const now = new Date(2026, 10, 6, 15, 30); // Fri 6 Nov 2026, 15:30 local
  it('starts now for "now" and ends the chosen number of days later', () => {
    const w = windowFor('now', 7, now);
    assert.equal(new Date(w.starts_at).getTime(), now.getTime());
    assert.equal(
      Date.parse(w.ends_at) - Date.parse(w.starts_at),
      7 * 86_400_000 - (dstShift(w) || 0),
    );
  });
  it('starts at local midnight tomorrow', () => {
    const s = new Date(windowFor('tomorrow', 7, now).starts_at);
    assert.equal(s.getHours(), 0);
    assert.equal(s.getMinutes(), 0);
    assert.equal(s.getDate(), 7);
  });
  it('starts at local midnight on the NEXT Monday, never today', () => {
    const s = new Date(windowFor('monday', 14, now).starts_at);
    assert.equal(s.getDay(), 1);
    assert.equal(s.getDate(), 9); // Fri 6 Nov -> Mon 9 Nov
    const onMonday = new Date(2026, 10, 9, 8, 0); // it is Monday morning
    assert.equal(new Date(windowFor('monday', 7, onMonday).starts_at).getDate(), 16);
  });
  it('ends whole local days after the start', () => {
    const w = windowFor('tomorrow', 30, now);
    const s = new Date(w.starts_at);
    const e = new Date(w.ends_at);
    assert.equal(e.getHours(), 0);
    assert.equal(Math.round((e.getTime() - s.getTime()) / 86_400_000), 30);
  });
});

// A daylight-saving change inside the window makes it 23 or 25 hours long: tolerate that in the one
// test that compares raw milliseconds.
function dstShift(w: { starts_at: string; ends_at: string }): number {
  const s = new Date(w.starts_at);
  const e = new Date(w.ends_at);
  return (e.getTimezoneOffset() - s.getTimezoneOffset()) * 60_000;
}
