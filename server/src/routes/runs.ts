import { Router } from 'express';
import { z } from 'zod';

import type { Db } from '../db.js';
import { HttpError } from '../errors.js';
import {
  cleanPoints,
  encodePolyline,
  pathDistanceM,
  simplify,
  trimEnds,
  type GeoPoint,
} from '../lib/geo.js';
import { currentUserId } from '../middleware/auth.js';

const MAX_POINTS = 50_000;
const MAX_RUN_HOURS = 24;
// Friends see the route without its first and last stretch (see trimEnds).
const PUBLIC_TRIM_M = 200;
const SIMPLIFY_EPSILON_M = 3;
const DEFAULT_WEIGHT_KG = 70;

const pointSchema = z.object({
  seq: z.number().int().min(0),
  /** Epoch milliseconds of the GPS fix. */
  t: z.number().int().positive(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  alt: z.number().nullable().optional(),
  acc: z.number().min(0).nullable().optional(),
  spd: z.number().nullable().optional(),
  /** Bumps by one on every resume after a pause. */
  seg: z.number().int().min(0).default(0),
});

const bodySchema = z
  .object({
    /** Generated on the phone, so retrying an upload can never create a duplicate run. */
    id: z.string().uuid(),
    startedAt: z.string().datetime({ offset: true }),
    endedAt: z.string().datetime({ offset: true }),
    movingTimeS: z.number().int().min(0),
    points: z.array(pointSchema).min(2).max(MAX_POINTS),
  })
  .refine(
    (b) => Date.parse(b.endedAt) >= Date.parse(b.startedAt),
    'endedAt must not be before startedAt',
  )
  .refine(
    (b) => Date.parse(b.endedAt) - Date.parse(b.startedAt) <= MAX_RUN_HOURS * 3_600_000,
    'A run cannot last more than 24 hours',
  );

type RunRow = {
  id: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  moving_time_s: number;
  avg_pace_s_per_km: number | null;
  kcal_est: number | null;
  suspicious: boolean;
};
const RUN_COLUMNS = `id, started_at, ended_at, distance_m, moving_time_s, avg_pace_s_per_km, kcal_est, suspicious`;

export function runsRouter({ db }: { db: Db }) {
  const router = Router();

  router.post('/', async (req, res) => {
    const userId = currentUserId(req);
    const body = bodySchema.parse(req.body);

    // Re-derive everything from the raw track. Nothing the phone claims about distance, calories or
    // routes is trusted: only the points themselves.
    const seqs = new Set(body.points.map((p) => p.seq));
    if (seqs.size !== body.points.length)
      throw new HttpError(400, 'duplicate_seq', 'Point seq values must be unique');
    const ordered = [...body.points].sort((a, b) => a.seq - b.seq);
    const geo = ordered.map((p) => ({ ...p, accuracy: p.acc })) as Array<
      (typeof ordered)[number] & GeoPoint
    >;
    for (const g of geo) {
      g.segment = g.seg;
    }
    const clean = cleanPoints(geo) as typeof geo;
    if (clean.length < 2)
      throw new HttpError(422, 'no_valid_track', 'The track has too few usable GPS points');

    const distanceM = Math.round(pathDistanceM(clean) * 10) / 10;
    const elapsedS = Math.floor((Date.parse(body.endedAt) - Date.parse(body.startedAt)) / 1000);
    const movingTimeS = Math.min(body.movingTimeS, elapsedS);
    const avgPace =
      distanceM > 0 && movingTimeS > 0 ? Math.round(movingTimeS / (distanceM / 1000)) : null;

    const route = encodePolyline(simplify(clean, SIMPLIFY_EPSILON_M));
    const publicPoints = trimEnds(clean, PUBLIC_TRIM_M);
    const publicRoute =
      publicPoints.length >= 2 ? encodePolyline(simplify(publicPoints, SIMPLIFY_EPSILON_M)) : null;

    const result = await db.asUser(userId, async (q) => {
      const profile = await q.query<{ weight_kg: number | null }>(`select weight_kg from profiles`);
      // Rough rule of thumb for running: about 1 kcal per kg of body weight per km. An estimate.
      const kcal = Math.round(
        (profile.rows[0]?.weight_kg ?? DEFAULT_WEIGHT_KG) * (distanceM / 1000),
      );

      const inserted = await q.query<RunRow>(
        `insert into runs (id, user_id, started_at, ended_at, distance_m, moving_time_s, avg_pace_s_per_km,
                           kcal_est, route_polyline, route_polyline_public)
         values ($1, app.uid(), $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (id) do nothing
         returning ${RUN_COLUMNS}`,
        [
          body.id,
          body.startedAt,
          body.endedAt,
          distanceM,
          movingTimeS,
          avgPace,
          kcal,
          route,
          publicRoute,
        ],
      );

      if (!inserted.rows[0]) {
        // The id already exists. If it is MY run this is a retry of an upload that actually succeeded.
        const existing = await q.query<RunRow>(`select ${RUN_COLUMNS} from runs where id = $1`, [
          body.id,
        ]);
        if (existing.rows[0]) return { run: existing.rows[0], created: false };
        throw new HttpError(409, 'id_conflict');
      }

      // One bulk insert instead of thousands of round trips.
      await q.query(
        `insert into run_points (run_id, seq, recorded_at, lat, lng, altitude_m, accuracy_m, speed_mps, segment)
         select $1, * from unnest($2::int[], $3::timestamptz[], $4::float8[], $5::float8[], $6::real[],
                                  $7::real[], $8::real[], $9::int[])`,
        [
          body.id,
          clean.map((p) => p.seq),
          clean.map((p) => new Date(p.t).toISOString()),
          clean.map((p) => p.lat),
          clean.map((p) => p.lng),
          clean.map((p) => p.alt ?? null),
          clean.map((p) => p.acc ?? null),
          clean.map((p) => p.spd ?? null),
          clean.map((p) => p.segment),
        ],
      );
      return { run: inserted.rows[0], created: true };
    });

    res.status(result.created ? 201 : 200).json(result.run);
  });

  return router;
}
