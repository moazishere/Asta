import type { Queryable } from '../db.js';

export type WeekAnchor = { tz: string; week_start: string; today: string };

/**
 * The caller's time zone (profiles.timezone, falling back to UTC if Postgres does not know the name),
 * "today" in that zone, and the Monday of the week containing `week` (default: today). Weeks run
 * Monday to Sunday and days are cut in the user's own zone.
 */
export async function getWeekAnchor(q: Queryable, week?: string): Promise<WeekAnchor | null> {
  const r = await q.query<WeekAnchor>(
    `select t.tz,
            to_char(date_trunc('week', coalesce($1::date, (now() at time zone t.tz)::date)::timestamp)::date, 'YYYY-MM-DD') as week_start,
            to_char((now() at time zone t.tz)::date, 'YYYY-MM-DD') as today
     from (select case when exists (select 1 from pg_timezone_names n where n.name = p.timezone)
                       then p.timezone else 'UTC' end as tz
           from profiles p) t`,
    [week ?? null],
  );
  return r.rows[0] ?? null;
}
