import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { movingTimeMs, pathDistanceM, type GeoPoint } from '../src/lib/geo.js';
import { computeSplits } from '../src/lib/splits.js';
import { addDays, buildWeekly, isValidDate } from '../src/lib/weekly.js';

const M_PER_DEG_LAT = 111_195;
const pt = (northM: number, t: number, segment = 0): GeoPoint => ({
  lat: 33 + northM / M_PER_DEG_LAT,
  lng: 36,
  t,
  segment,
});
/** `legs` legs of `stepM` metres, one every `dtMs`, starting at `startM` / `t0`. */
const line = (legs: number, stepM: number, dtMs: number, startM = 0, t0 = 0, segment = 0) =>
  Array.from({ length: legs + 1 }, (_, i) => pt(startM + i * stepM, t0 + i * dtMs, segment));

describe('computeSplits', () => {
  it('splits 3.5 km into three full kilometres and a 500 m remainder', () => {
    const splits = computeSplits(line(350, 10, 3333)); // 10 m every 3.333 s = 3 m/s
    assert.equal(splits.length, 4);
    assert.deepEqual(
      splits.map((s) => s.km),
      [1, 2, 3, 4],
    );
    for (const s of splits.slice(0, 3)) {
      assert.ok(Math.abs(s.distance_m - 1000) < 0.5, String(s.distance_m));
      assert.ok(Math.abs(s.duration_s - 333.3) < 0.6, String(s.duration_s));
      assert.equal(s.pace_s_per_km, 333);
    }
    assert.ok(Math.abs(splits[3]!.distance_m - 500) < 0.5);
    assert.equal(splits[3]!.pace_s_per_km, 333, 'pace is per km even for a partial split');
  });

  it('distances add up to the path distance and durations to the moving time', () => {
    const pts = [
      ...line(150, 10, 3333),
      ...line(250, 10, 3000, 5000, 1_000_000, 1), // second segment after a pause, faster
    ];
    const splits = computeSplits(pts);
    const dist = splits.reduce((t, s) => t + s.distance_m, 0);
    const secs = splits.reduce((t, s) => t + s.duration_s, 0);
    assert.ok(Math.abs(dist - pathDistanceM(pts)) < 0.5 * splits.length);
    assert.ok(Math.abs(secs - movingTimeMs(pts) / 1000) < 0.1 * splits.length);
  });

  it('divides a single leg that crosses a kilometre boundary in proportion', () => {
    const splits = computeSplits([pt(0, 0), pt(1500, 500_000)]); // 3 m/s
    assert.equal(splits.length, 2);
    assert.ok(Math.abs(splits[0]!.distance_m - 1000) < 0.5);
    assert.ok(Math.abs(splits[0]!.duration_s - 333.3) < 0.2);
    assert.ok(Math.abs(splits[1]!.distance_m - 500) < 0.5);
    assert.ok(Math.abs(splits[1]!.duration_s - 166.7) < 0.2);
  });

  it('never measures distance or time across a pause', () => {
    const splits = computeSplits([
      ...line(50, 10, 3333),
      ...line(50, 10, 3333, 90_000, 5_000_000, 1),
    ]);
    const dist = splits.reduce((t, s) => t + s.distance_m, 0);
    assert.ok(Math.abs(dist - 1000) < 1, String(dist));
    assert.ok(splits.reduce((t, s) => t + s.duration_s, 0) < 340);
  });

  it('adds distance but no time while standing still', () => {
    // 4 m every 20 s = 0.2 m/s, below the 0.5 m/s moving threshold
    const splits = computeSplits(line(10, 4, 20_000));
    assert.equal(splits.length, 1);
    assert.ok(Math.abs(splits[0]!.distance_m - 40) < 0.2);
    assert.equal(splits[0]!.duration_s, 0);
    assert.equal(splits[0]!.pace_s_per_km, null);
  });

  it('has no pace for a tiny last split and returns [] for fewer than two points', () => {
    const splits = computeSplits(line(103, 10, 3333)); // 1030 m
    assert.equal(splits.length, 2);
    assert.equal(splits[1]!.pace_s_per_km, null, '30 m is too short for a pace');
    assert.deepEqual(computeSplits([]), []);
    assert.deepEqual(computeSplits([pt(0, 0)]), []);
  });
});

describe('movingTimeMs', () => {
  it('counts moving gaps, skips standing still and pauses', () => {
    const pts = [
      pt(0, 0),
      pt(10, 3000),
      pt(11, 40_000),
      pt(5000, 100_000, 1),
      pt(5010, 103_000, 1),
    ];
    assert.equal(movingTimeMs(pts), 6000);
  });
});

describe('weekly helpers', () => {
  it('adds days across month and year boundaries', () => {
    assert.equal(addDays('2026-11-02', 6), '2026-11-08');
    assert.equal(addDays('2026-12-30', 3), '2027-01-02');
    assert.equal(addDays('2026-03-02', -7), '2026-02-23');
  });
  it('validates calendar dates', () => {
    assert.equal(isValidDate('2026-11-05'), true);
    assert.equal(isValidDate('2026-13-05'), false);
    assert.equal(isValidDate('2026-02-30'), false);
    assert.equal(isValidDate('tomorrow'), false);
  });
  it('builds a zero-filled Monday-first week with this/last week totals', () => {
    const rows = [
      { day: '2026-10-27', distance_m: 5000, runs: 1, moving_time_s: 1700 }, // last week
      { day: '2026-11-01', distance_m: 3000, runs: 1, moving_time_s: 1000 }, // last Sunday
      { day: '2026-11-02', distance_m: 4000, runs: 2, moving_time_s: 1300 }, // Monday
      { day: '2026-11-04', distance_m: 2500, runs: 1, moving_time_s: 800 },
      { day: '2026-11-09', distance_m: 9999, runs: 1, moving_time_s: 9 }, // next week: ignored
    ];
    const w = buildWeekly(rows, '2026-11-02', '2026-11-04');
    assert.deepEqual(
      w.days.map((d) => d.date),
      [
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
        '2026-11-07',
        '2026-11-08',
      ],
    );
    assert.deepEqual(
      w.days.map((d) => d.distance_m),
      [4000, 0, 2500, 0, 0, 0, 0],
    );
    assert.deepEqual(w.thisWeek, { distance_m: 6500, runs: 3, moving_time_s: 2100 });
    assert.deepEqual(w.lastWeek, { distance_m: 8000, runs: 2, moving_time_s: 2700 });
  });
  it('returns zeros when there are no runs', () => {
    const w = buildWeekly([], '2026-11-02', '2026-11-04');
    assert.deepEqual(w.thisWeek, { distance_m: 0, runs: 0, moving_time_s: 0 });
    assert.ok(w.days.every((d) => d.distance_m === 0));
  });
});
