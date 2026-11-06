import { Router } from 'express';
import { z } from 'zod';

import type { Config } from '../config.js';
import type { Db } from '../db.js';
import { HttpError, isUniqueViolation } from '../errors.js';
import { notifyUserChallenges } from '../lib/challengeEvents.js';
import { currentUserId } from '../middleware/auth.js';
import type { Hub } from '../realtime.js';

const PROFILE_COLUMNS = `id, username, display_name, avatar_url, height_cm, weight_kg, birth_year,
  sex, daily_kcal_goal, timezone, onboarded_at`;

const isValidTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const patchBody = z
  .object({
    username: z
      .string()
      .regex(/^[a-z0-9_]{3,20}$/, 'Use 3-20 lowercase letters, numbers or underscores'),
    display_name: z.string().trim().min(1).max(40),
    height_cm: z.number().min(100).max(250),
    weight_kg: z.number().min(30).max(300),
    birth_year: z
      .number()
      .int()
      .min(1920)
      .max(new Date().getFullYear() - 10),
    sex: z.enum(['male', 'female']),
    daily_kcal_goal: z.number().int().min(800).max(10000),
    timezone: z.string().refine(isValidTimeZone, 'Unknown time zone'),
    /** Marks onboarding finished. Fails unless every onboarding field is set. */
    complete_onboarding: z.boolean(),
  })
  .partial()
  // Unknown keys (e.g. id, onboarded_at, avatar_url) are rejected, so a client can never write them.
  .strict();

const REQUIRED_FOR_ONBOARDING = [
  'username',
  'height_cm',
  'weight_kg',
  'birth_year',
  'sex',
  'daily_kcal_goal',
] as const;

export function profileRouter({ db, hub }: { db: Db; config: Config; hub: Hub }) {
  const router = Router();

  router.get('/', async (req, res) => {
    const id = currentUserId(req);
    const user = await db.asService(async (q) => {
      const { rows } = await q.query<{ id: string; email: string }>(
        `select id, email from users where id = $1`,
        [id],
      );
      return rows[0];
    });
    if (!user) throw new HttpError(401, 'unauthorized');
    res.json(user);
  });

  // RLS decides what is visible: app_user can only ever see its own profile row here.
  router.get('/profile', async (req, res) => {
    const profile = await db.asUser(currentUserId(req), async (q) => {
      const { rows } = await q.query(`select ${PROFILE_COLUMNS} from profiles`);
      return rows[0];
    });
    if (!profile) throw new HttpError(404, 'profile_not_found');
    res.json(profile);
  });

  router.patch('/profile', async (req, res) => {
    const { complete_onboarding, ...fields } = patchBody.parse(req.body);
    const columns = Object.keys(fields);
    if (columns.length === 0 && !complete_onboarding) throw new HttpError(400, 'nothing_to_update');

    try {
      const profile = await db.asUser(currentUserId(req), async (q) => {
        // Column names come from the strict zod schema's keys (never from raw input), so this is safe.
        const set = columns.map((c, i) => `${c} = $${i + 1}`);
        if (columns.length === 0) set.push('id = id');
        const { rows } = await q.query<Record<string, unknown>>(
          `update profiles set ${set.join(', ')} where id = app.uid() returning ${PROFILE_COLUMNS}`,
          Object.values(fields),
        );
        let row = rows[0];
        if (!row) throw new HttpError(404, 'profile_not_found');

        if (complete_onboarding) {
          const missing = REQUIRED_FOR_ONBOARDING.filter((c) => row![c] == null);
          if (missing.length)
            throw new HttpError(400, 'incomplete_profile', `Missing: ${missing.join(', ')}`);
          const done = await q.query<Record<string, unknown>>(
            `update profiles set onboarded_at = coalesce(onboarded_at, now()) where id = app.uid()
             returning ${PROFILE_COLUMNS}`,
          );
          row = done.rows[0]!;
        }
        return row;
      });
      // A new calorie goal or time zone can change which days count in a calorie challenge.
      await notifyUserChallenges(db, hub, currentUserId(req));
      res.json(profile);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new HttpError(409, 'username_taken', 'That username is taken');
      throw err;
    }
  });

  return router;
}
