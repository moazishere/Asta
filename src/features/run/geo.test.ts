import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyFix,
  elapsedMs,
  emptyTrack,
  estimateKcal,
  formatDuration,
  formatKm,
  formatPace,
  haversineM,
  isSuspicious,
  paceSecPerKm,
  type Fix,
  type TrackState,
} from './geo';

const M_PER_DEG_LAT = 111_195;
const fix = (northM: number, t: number, extra: Partial<Fix> = {}): Fix => ({
  lat: 33 + northM / M_PER_DEG_LAT,
  lng: 36,
  t,
  accuracy: 5,
  segment: 0,
  ...extra,
});

/** Feeds fixes in order and returns the final state plus every verdict. */
function replay(fixes: Fix[], start: TrackState = emptyTrack) {
  let state = start;
  const verdicts: string[] = [];
  for (const f of fixes) {
    const r = applyFix(state, f);
    state = r.state;
    verdicts.push(r.verdict);
  }
  return { state, verdicts };
}

describe('haversineM', () => {
  it('measures one degree of latitude as about 111.2 km', () => {
    const d = haversineM({ lat: 0, lng: 0 }, { lat: 1, lng: 0 });
    assert.ok(Math.abs(d - 111_195) < 100, String(d));
  });
  it('is zero for identical points and symmetric', () => {
    const a = { lat: 33.5, lng: 36.3 };
    const b = { lat: 33.6, lng: 36.4 };
    assert.equal(haversineM(a, a), 0);
    assert.ok(Math.abs(haversineM(a, b) - haversineM(b, a)) < 1e-6);
  });
  it('shrinks east-west distances with latitude', () => {
    const equator = haversineM({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const at60 = haversineM({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    assert.ok(Math.abs(at60 / equator - 0.5) < 0.01);
  });
});

describe('applyFix: filtering', () => {
  it('accepts the first fix and starts measuring from it', () => {
    const { state, verdicts } = replay([fix(0, 0)]);
    assert.deepEqual(verdicts, ['accepted']);
    assert.equal(state.distanceM, 0);
    assert.ok(state.last);
  });
  it('rejects fixes worse than 30 m, but accepts exactly 30 m and unknown accuracy', () => {
    assert.equal(applyFix(emptyTrack, fix(0, 0, { accuracy: 30.1 })).verdict, 'inaccurate');
    assert.equal(applyFix(emptyTrack, fix(0, 0, { accuracy: 30 })).verdict, 'accepted');
    assert.equal(applyFix(emptyTrack, fix(0, 0, { accuracy: null })).verdict, 'accepted');
    assert.equal(
      applyFix(emptyTrack, fix(0, 0, { accuracy: -1 })).verdict,
      'inaccurate',
      'iOS uses -1 for invalid',
    );
  });
  it('rejects jumps above 12 m/s and keeps the track from before the jump', () => {
    const start = replay([fix(0, 0), fix(8, 3000)]).state;
    const jump = applyFix(start, fix(8 + 13 * 3, 6000)); // 13 m/s
    assert.equal(jump.verdict, 'jump');
    assert.equal(jump.state, start, 'a rejected fix must not change the state');
    assert.equal(applyFix(start, fix(8 + 11 * 3, 6000)).verdict, 'accepted'); // 11 m/s is fine
  });
  it('rejects repeated or out-of-order timestamps', () => {
    const start = replay([fix(0, 5000)]).state;
    assert.equal(applyFix(start, fix(8, 5000)).verdict, 'stale');
    assert.equal(applyFix(start, fix(8, 4000)).verdict, 'stale');
  });
  it('measures after a jump from the last good point, not from the bad one', () => {
    const { state } = replay([fix(0, 0), fix(8, 3000), fix(5000, 6000), fix(16, 9000)]);
    assert.ok(Math.abs(state.distanceM - 16) < 0.2, String(state.distanceM));
  });
});

describe('applyFix: segments (pauses and recovery)', () => {
  it('adds no distance across a segment change, even for a huge gap', () => {
    const { state, verdicts } = replay([
      fix(0, 0),
      fix(100, 30_000),
      fix(20_000, 900_000, { segment: 1 }), // resumed 20 km away after 15 minutes
      fix(20_100, 930_000, { segment: 1 }),
    ]);
    assert.deepEqual(verdicts, ['accepted', 'accepted', 'accepted', 'accepted']);
    assert.ok(Math.abs(state.distanceM - 200) < 0.5, String(state.distanceM));
  });
});

describe('applyFix: moving time', () => {
  it('counts time between fixes while moving', () => {
    const { state } = replay([fix(0, 0), fix(8, 3000), fix(16, 6000)]);
    assert.equal(state.movingMs, 6000);
  });
  it('does not count standing still as moving time', () => {
    // 3 m in 20 s = 0.15 m/s, below the 0.5 m/s threshold
    const { state } = replay([fix(0, 0), fix(3, 20_000), fix(11, 23_000)]);
    assert.equal(state.movingMs, 3000);
  });
  it('a 5 km run at 3 m/s gives ~5 km, ~27.8 min moving and ~5:33 per km', () => {
    const fixes = Array.from({ length: 626 }, (_, i) => fix(i * 8, i * 2667)); // 8 m every 2.667 s
    const { state } = replay(fixes);
    assert.ok(Math.abs(state.distanceM - 5000) < 5, String(state.distanceM));
    assert.ok(Math.abs(state.movingMs / 1000 - 1666.9) < 1);
    const pace = paceSecPerKm(state.distanceM, state.movingMs)!;
    assert.ok(Math.abs(pace - 333.4) < 1, String(pace));
    assert.equal(formatPace(pace), '5:33');
  });
});

describe('paceSecPerKm', () => {
  it('is null until there is a meaningful distance or time', () => {
    assert.equal(paceSecPerKm(0, 0), null);
    assert.equal(paceSecPerKm(9, 5000), null);
    assert.equal(paceSecPerKm(500, 0), null);
  });
  it('divides moving time by distance', () => {
    assert.equal(paceSecPerKm(1000, 300_000), 300);
    assert.equal(paceSecPerKm(2000, 720_000), 360);
  });
});

describe('estimateKcal and isSuspicious', () => {
  it('estimates about 1 kcal per kg per km', () => {
    assert.equal(estimateKcal(70, 10_000), 700);
    assert.equal(estimateKcal(80, 2392), 191);
    assert.equal(estimateKcal(70, 0), 0);
  });
  it('flags averages above 20 km/h only', () => {
    assert.equal(isSuspicious(5000, 1000), false); // 18 km/h
    assert.equal(isSuspicious(5000, 900), false); // exactly 20 km/h
    assert.equal(isSuspicious(5000, 850), true); // 21.2 km/h
    assert.equal(isSuspicious(5000, 0), false);
  });
});

describe('elapsedMs', () => {
  it('subtracts completed pauses', () => {
    assert.equal(
      elapsedMs({ startedAt: 1000, pausedTotalMs: 20_000, pauseStartedAt: null, now: 101_000 }),
      80_000,
    );
  });
  it('freezes while a pause is in progress', () => {
    const at = (now: number) =>
      elapsedMs({ startedAt: 0, pausedTotalMs: 0, pauseStartedAt: 60_000, now });
    assert.equal(at(60_000), 60_000);
    assert.equal(at(90_000), 60_000);
  });
  it('never goes negative', () => {
    assert.equal(
      elapsedMs({ startedAt: 5000, pausedTotalMs: 0, pauseStartedAt: null, now: 1000 }),
      0,
    );
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    assert.equal(formatDuration(0), '00:00');
    assert.equal(formatDuration(125), '02:05');
    assert.equal(formatDuration(3725), '1:02:05');
    assert.equal(formatDuration(-4), '00:00');
  });
  it('formats pace and distance', () => {
    assert.equal(formatPace(342), '5:42');
    assert.equal(formatPace(359.6), '6:00');
    assert.equal(formatPace(null), '--:--');
    assert.equal(formatPace(Infinity), '--:--');
    assert.equal(formatKm(2392.4), '2.39');
    assert.equal(formatKm(0), '0.00');
  });
});
