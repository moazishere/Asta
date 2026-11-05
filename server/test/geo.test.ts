import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  cleanPoints,
  decodePolyline,
  encodePolyline,
  haversineM,
  pathDistanceM,
  simplify,
  trimEnds,
  type GeoPoint,
} from '../src/lib/geo.js';

const M_PER_DEG_LAT = 111_195; // metres per degree of latitude on the mean-radius sphere
/** A point `metres` north of (33, 36). */
const north = (metres: number, t = 0, extra: Partial<GeoPoint> = {}): GeoPoint => ({
  lat: 33 + metres / M_PER_DEG_LAT,
  lng: 36,
  t,
  segment: 0,
  ...extra,
});

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

describe('cleanPoints', () => {
  it('keeps a normal run and drops fixes with poor accuracy', () => {
    const pts = [north(0, 0), north(8, 3000, { accuracy: 80 }), north(16, 6000, { accuracy: 5 })];
    const kept = cleanPoints(pts);
    assert.equal(kept.length, 2);
    assert.equal(kept[1]!.accuracy, 5);
  });
  it('drops teleports (more than 12 m/s) but keeps the points after them', () => {
    const pts = [north(0, 0), north(8, 3000), north(5000, 6000), north(16, 9000), north(24, 12000)];
    const kept = cleanPoints(pts);
    assert.equal(kept.length, 4);
    assert.ok(!kept.some((p) => haversineM(p, north(5000)) < 1));
  });
  it('drops out-of-order or repeated timestamps', () => {
    const kept = cleanPoints([north(0, 5000), north(8, 5000), north(16, 4000)]);
    assert.equal(kept.length, 1);
  });
  it('does not treat the jump across a pause as a teleport', () => {
    const pts = [
      north(0, 0),
      north(8, 3000),
      north(9000, 600_000, { segment: 1 }),
      north(9008, 603_000, { segment: 1 }),
    ];
    assert.equal(cleanPoints(pts).length, 4);
  });
});

describe('pathDistanceM', () => {
  it('sums consecutive legs', () => {
    const d = pathDistanceM([north(0), north(100, 1), north(250, 2)]);
    assert.ok(Math.abs(d - 250) < 0.5);
  });
  it('never counts distance across a pause', () => {
    const d = pathDistanceM([
      north(0),
      north(100, 1),
      north(9000, 2, { segment: 1 }),
      north(9100, 3, { segment: 1 }),
    ]);
    assert.ok(Math.abs(d - 200) < 0.5, String(d));
  });
  it('is zero for fewer than two points', () => {
    assert.equal(pathDistanceM([]), 0);
    assert.equal(pathDistanceM([north(0)]), 0);
  });
});

describe('simplify (Douglas-Peucker)', () => {
  it('collapses a straight line to its endpoints', () => {
    const line = Array.from({ length: 200 }, (_, i) => north(i * 8, i));
    const out = simplify(line, 3);
    assert.equal(out.length, 2);
  });
  it('keeps a corner that is further than epsilon from the straight line', () => {
    const east = (m: number, t: number): GeoPoint => ({
      lat: 33.002,
      lng: 36 + m / (M_PER_DEG_LAT * Math.cos((33 * Math.PI) / 180)),
      t,
      segment: 0,
    });
    const path = [north(0, 0), north(100, 1), north(200, 2), east(100, 3), east(200, 4)];
    const out = simplify(path, 3);
    assert.ok(out.length >= 3);
    assert.equal(out[0], path[0]);
    assert.equal(out[out.length - 1], path[path.length - 1]);
  });
  it('handles very long tracks without overflowing the stack', () => {
    // Weaves ~11 m east/west of the line, i.e. sideways to the direction of travel.
    const zigzag = Array.from({ length: 50_000 }, (_, i) =>
      north(i * 5, i, { lng: 36 + (i % 2) * 0.00012 }),
    );
    assert.ok(simplify(zigzag, 3).length > 1000);
  });
});

describe('trimEnds', () => {
  const route = Array.from({ length: 126 }, (_, i) => north(i * 8, i)); // 1000 m
  it('removes the first and last 200 m', () => {
    const out = trimEnds(route, 200);
    assert.ok(haversineM(out[0]!, route[0]!) >= 199);
    assert.ok(haversineM(out[out.length - 1]!, route[route.length - 1]!) >= 199);
    assert.ok(out.length >= 74 && out.length <= 78, String(out.length)); // 600 m kept at 8 m spacing
  });
  it('hides routes shorter than twice the trim distance entirely', () => {
    assert.deepEqual(trimEnds(route.slice(0, 40), 200), []);
  });
});

describe('polyline encoding', () => {
  it('matches the reference example from Google’s documentation', () => {
    const encoded = encodePolyline([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
    assert.equal(encoded, '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  });
  it('round-trips to 5 decimal places', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({
      lat: 33.5 + i * 0.00037,
      lng: 36.3 - i * 0.00021,
    }));
    const back = decodePolyline(encodePolyline(pts));
    assert.equal(back.length, pts.length);
    back.forEach((p, i) => {
      assert.ok(Math.abs(p.lat - pts[i]!.lat) < 1e-5);
      assert.ok(Math.abs(p.lng - pts[i]!.lng) < 1e-5);
    });
  });
});
