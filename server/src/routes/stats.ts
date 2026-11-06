import { Router } from 'express';
import { z } from 'zod';

import type { Db } from '../db.js';
import { HttpError } from '../errors.js';
import { getWeekAnchor } from '../lib/weekAnchor.js';
import { buildWeekly, isValidDate, type DayRow } from '../lib/weekly.js';
import { currentUserId } from '../middleware/auth.js';

const weeklyQuery = z.object({
  /** Any date (YYYY-MM-DD) inside the week to show. Defaults to the user's current week. */
  week: z.string().refine(isValidDate, 'Use YYYY-MM-DD').optional(),
});

export function statsRouter({ db }: { db: Db }) {
  const router = Router();

  // Weeks run Monday to Sunday and days are cut in the USER'S time zone (profiles.timezone), so a run
  // at 11:30 pm local time counts for that day even though it is already tomorrow in UTC.
  router.get('/weekly', async (req, res) => {
    const { week } = weeklyQuery.parse(req.query);

    const stats = await db.asUser(currentUserId(req), async (q) => {
      const a = await getWeekAnchor(q, week);
      if (!a) throw new HttpError(404, 'profile_not_found');

      const days = await q.query<DayRow>(
        `select to_char((started_at at time zone $1)::date, 'YYYY-MM-DD') as day,
                sum(distance_m)::float8 as distance_m,
                count(*)::int as runs,
                coalesce(sum(moving_time_s), 0)::int as moving_time_s
         from runs
         where (started_at at time zone $1)::date >= ($2::date - 7)
           and (started_at at time zone $1)::date <  ($2::date + 7)
         group by 1`,
        [a.tz, a.week_start],
      );
      return buildWeekly(days.rows, a.week_start, a.today);
    });

    res.json(stats);
  });

  return router;
}
