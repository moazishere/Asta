import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  barHeights,
  decodePolyline,
  percentChange,
  projectRoute,
  speedRatios,
  toSvgPath,
} from './stats';

describe('percentChange', () => {
  it('computes the rounded relative change', () => {
    assert.equal(percentChange(12, 10), 20);
    assert.equal(percentChange(5, 10), -50);
    assert.equal(percentChange(10, 10), 0);
    assert.equal(percentChange(10.4, 10), 4);
  });
  it('is null when there is no previous value to compare with', () => {
    assert.equal(percentChange(5, 0), null);
    assert.equal(percentChange(0, 0), null);
  });
});

describe('barHeights', () => {
  it('scales to the tallest bar', () => {
    assert.deepEqual(barHeights([0, 5000, 10_000], 100), [0, 50, 100]);
  });
  it('keeps small non-zero days visible and zero days empty', () => {
    const [tiny, huge] = barHeights([10, 20_000], 100);
    assert.equal(tiny, 4);
    assert.equal(huge, 100);
    assert.equal(
      barHeights([0, 0, 0], 100).every((h) => h === 0),
      true,
    );
  });
  it('handles an empty week', () => {
    assert.deepEqual(barHeights([], 100), []);
  });
});

describe('speedRatios', () => {
  it('gives the fastest split 1 and slower ones proportionally less', () => {
    const r = speedRatios([300, 360, 600]);
    assert.equal(r[0], 1);
    assert.ok(Math.abs(r[1]! - 300 / 360) < 1e-9);
    assert.equal(r[2], 0.5);
  });
  it('gives splits without a pace 0 and copes with no valid paces', () => {
    assert.deepEqual(speedRatios([null, 300, null]), [0, 1, 0]);
    assert.deepEqual(speedRatios([null, null]), [0, 0]);
  });
});

describe('decodePolyline', () => {
  it('decodes the reference example from the encoding specification', () => {
    const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    assert.equal(pts.length, 3);
    assert.ok(
      Math.abs(pts[0]!.latitude - 38.5) < 1e-9 && Math.abs(pts[0]!.longitude + 120.2) < 1e-9,
    );
    assert.ok(
      Math.abs(pts[1]!.latitude - 40.7) < 1e-9 && Math.abs(pts[1]!.longitude + 120.95) < 1e-9,
    );
    assert.ok(
      Math.abs(pts[2]!.latitude - 43.252) < 1e-9 && Math.abs(pts[2]!.longitude + 126.453) < 1e-9,
    );
  });
  it('returns nothing for an empty string', () => {
    assert.deepEqual(decodePolyline(''), []);
  });
});

describe('projectRoute', () => {
  const box = (pts: { x: number; y: number }[]) => ({
    minX: Math.min(...pts.map((p) => p.x)),
    maxX: Math.max(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxY: Math.max(...pts.map((p) => p.y)),
  });

  it('fits inside the box minus padding and keeps north up', () => {
    const route = [
      { latitude: 33.5, longitude: 36.3 },
      { latitude: 33.51, longitude: 36.31 },
      { latitude: 33.52, longitude: 36.3 },
    ];
    const pts = projectRoute(route, 64, 64, 4);
    const b = box(pts);
    assert.ok(b.minX >= 4 - 1e-9 && b.maxX <= 60 + 1e-9);
    assert.ok(b.minY >= 4 - 1e-9 && b.maxY <= 60 + 1e-9);
    assert.ok(pts[2]!.y < pts[0]!.y, 'a point further north has a smaller y');
  });

  it('does not stretch the shape: a square on the ground stays square', () => {
    const lat = 33.5;
    const dLat = 0.01;
    const dLng = dLat / Math.cos((lat * Math.PI) / 180);
    const pts = projectRoute(
      [
        { latitude: lat, longitude: 36 },
        { latitude: lat + dLat, longitude: 36 + dLng },
      ],
      100,
      100,
      0,
    );
    const b = box(pts);
    assert.ok(Math.abs(b.maxX - b.minX - (b.maxY - b.minY)) < 0.5);
  });

  it('centres a wide route vertically', () => {
    const pts = projectRoute(
      [
        { latitude: 33.5, longitude: 36.0 },
        { latitude: 33.5, longitude: 36.1 },
      ],
      100,
      100,
      0,
    );
    assert.ok(Math.abs(pts[0]!.y - 50) < 1e-9 && Math.abs(pts[1]!.y - 50) < 1e-9);
  });

  it('copes with empty, single-point and identical-point routes', () => {
    assert.deepEqual(projectRoute([], 64, 64, 4), []);
    const one = projectRoute([{ latitude: 33.5, longitude: 36.3 }], 64, 64, 4);
    assert.deepEqual(one, [{ x: 32, y: 32 }]);
    const same = projectRoute(
      [
        { latitude: 33.5, longitude: 36.3 },
        { latitude: 33.5, longitude: 36.3 },
      ],
      64,
      64,
      4,
    );
    assert.ok(same.every((p) => p.x === 32 && p.y === 32));
  });
});

describe('toSvgPath', () => {
  it('builds a move-then-lines path', () => {
    assert.equal(
      toSvgPath([
        { x: 1, y: 2 },
        { x: 3.25, y: 4 },
      ]),
      'M1.0 2.0 L3.3 4.0',
    );
    assert.equal(toSvgPath([]), '');
  });
});
