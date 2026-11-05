// Pure helpers for the history and weekly screens: no React, no native modules, unit tested.
import type { LatLng } from '../run/geo';

/** Relative change in percent (rounded), or null when there is nothing to compare against. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * Bar heights for a column chart. The tallest bar gets `maxHeight`; a day with some distance never
 * shrinks below `minVisible` (so a short run is still visible); a day with none is exactly 0.
 */
export function barHeights(values: number[], maxHeight: number, minVisible = 4): number[] {
  const max = Math.max(...values, 0);
  if (max <= 0) return values.map(() => 0);
  return values.map((v) => (v <= 0 ? 0 : Math.max(minVisible, Math.round((v / max) * maxHeight))));
}

/**
 * Relative speed of each split, 0..1, where the fastest split is 1. Used for the pace bars: a longer
 * bar means a faster kilometre. Splits without a pace get 0.
 */
export function speedRatios(paces: (number | null)[]): number[] {
  const valid = paces.filter((p): p is number => p != null && p > 0);
  if (valid.length === 0) return paces.map(() => 0);
  const fastest = Math.min(...valid);
  return paces.map((p) => (p != null && p > 0 ? fastest / p : 0));
}

/** Decodes Google's Encoded Polyline format (precision 5). The server encodes routes this way. */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
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
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

export type XY = { x: number; y: number };

/**
 * Fits a route into a `width` x `height` box (minus `padding`) for drawing as a small SVG thumbnail.
 * Longitude is scaled by cos(latitude) so the shape is not stretched, aspect ratio is preserved and
 * the route is centred. North is up.
 */
export function projectRoute(points: LatLng[], width: number, height: number, padding = 0): XY[] {
  if (points.length === 0) return [];
  const lats = points.map((p) => p.latitude);
  const lngs = points.map((p) => p.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const lngScale = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180);

  const spanX = (maxLng - minLng) * lngScale;
  const spanY = maxLat - minLat;
  const innerW = width - 2 * padding;
  const innerH = height - 2 * padding;
  // A single point (or a perfectly straight N-S / E-W line) has a zero span in one direction.
  const scale = Math.min(
    spanX > 0 ? innerW / spanX : Infinity,
    spanY > 0 ? innerH / spanY : Infinity,
  );
  const k = Number.isFinite(scale) ? scale : 0;

  const offsetX = padding + (innerW - spanX * k) / 2;
  const offsetY = padding + (innerH - spanY * k) / 2;
  return points.map((p) => ({
    x: offsetX + (p.longitude - minLng) * lngScale * k,
    y: offsetY + (maxLat - p.latitude) * k,
  }));
}

/** "M x y L x y ..." for an SVG <Path>. */
export function toSvgPath(points: XY[]): string {
  return points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
}
