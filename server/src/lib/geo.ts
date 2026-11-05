export type GeoPoint = {
  lat: number;
  lng: number;
  /** Seconds-precision epoch millis of the fix. */
  t: number;
  segment: number;
  accuracy?: number | null;
};

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. (The app has its own copy in src/features/run/geo.ts.) */
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

// Same limits as the app's live filter. The server repeats them because it must not trust the client.
export const MAX_ACCURACY_M = 30;
export const MAX_SPEED_MPS = 12;

/**
 * Drops fixes a runner cannot have produced: poor accuracy, and "teleports" whose implied speed from
 * the previous kept fix (same segment) exceeds MAX_SPEED_MPS. Points must be sorted by time.
 */
export function cleanPoints(points: GeoPoint[]): GeoPoint[] {
  const kept: GeoPoint[] = [];
  for (const p of points) {
    if (p.accuracy != null && p.accuracy > MAX_ACCURACY_M) continue;
    const prev = kept[kept.length - 1];
    if (prev && prev.segment === p.segment) {
      const dt = (p.t - prev.t) / 1000;
      if (dt <= 0) continue;
      if (haversineM(prev, p) / dt > MAX_SPEED_MPS) continue;
    }
    kept.push(p);
  }
  return kept;
}

/** Total distance in metres, never measured across a pause (segment change). */
export function pathDistanceM(points: GeoPoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (a.segment === b.segment) total += haversineM(a, b);
  }
  return total;
}

/** Distance in metres from point p to the segment a-b, on a local flat approximation (fine at run scale). */
function distanceToSegmentM(p: GeoPoint, a: GeoPoint, b: GeoPoint): number {
  const mPerDegLat = 111_320;
  const mPerDegLng = 111_320 * Math.cos(toRad(a.lat));
  const ax = a.lng * mPerDegLng,
    ay = a.lat * mPerDegLat;
  const bx = b.lng * mPerDegLng,
    by = b.lat * mPerDegLat;
  const px = p.lng * mPerDegLng,
    py = p.lat * mPerDegLat;
  const dx = bx - ax,
    dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker line simplification: keeps the shape within `epsilonM` metres using far fewer points. */
export function simplify<T extends GeoPoint>(points: T[], epsilonM: number): T[] {
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  // Iterative (explicit stack) so a 50k-point run cannot overflow the call stack.
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = distanceToSegmentM(points[i]!, points[first]!, points[last]!);
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (index !== -1 && maxDist > epsilonM) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Removes the first and last `trimM` metres of the path (measured along the route). Friends see this
 * version, so nobody learns where someone starts and finishes (usually their home).
 * A route shorter than twice the trim distance is hidden entirely.
 */
export function trimEnds<T extends GeoPoint>(points: T[], trimM: number): T[] {
  if (points.length < 2) return [];
  const cumulative: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineM(points[i - 1]!, points[i]!));
  }
  const total = cumulative[cumulative.length - 1]!;
  if (total <= trimM * 2) return [];
  return points.filter((_, i) => cumulative[i]! >= trimM && cumulative[i]! <= total - trimM);
}

/** Google's Encoded Polyline Algorithm (precision 5): a compact string for a list of coordinates. */
export function encodePolyline(points: { lat: number; lng: number }[]): string {
  let prevLat = 0;
  let prevLng = 0;
  let out = '';
  const encode = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    let chunk = '';
    while (v >= 0x20) {
      chunk += String.fromCharCode((0x20 | (v & 0x1f)) + 63);
      v >>= 5;
    }
    return chunk + String.fromCharCode(v + 63);
  };
  for (const p of points) {
    const lat = Math.round(p.lat * 1e5);
    const lng = Math.round(p.lng * 1e5);
    out += encode(lat - prevLat) + encode(lng - prevLng);
    prevLat = lat;
    prevLng = lng;
  }
  return out;
}

export function decodePolyline(encoded: string): { lat: number; lng: number }[] {
  const points: { lat: number; lng: number }[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
