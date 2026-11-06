import { Router } from 'express';
import { z } from 'zod';

import type { Db, Queryable } from '../db.js';
import { HttpError } from '../errors.js';
import { macrosForGrams, scaleMacros, sumTotals, type Macros } from '../lib/nutrition.js';
import { isValidDate } from '../lib/weekly.js';
import { notifyUserChallenges } from '../lib/challengeEvents.js';
import { currentUserId } from '../middleware/auth.js';
import type { Hub } from '../realtime.js';

const date = z.string().refine(isValidDate, 'Use YYYY-MM-DD');
const meal = z.enum(['breakfast', 'lunch', 'dinner', 'snack']);
const idParam = z.object({ id: z.string().uuid() });

// Logging a food: the phone sends WHAT and HOW MUCH. The server looks the food up and computes the
// macros, so a modified app cannot invent calories. A quick add has no food: just a name and kcal.
const fromFood = z
  .object({
    food_id: z.string().uuid(),
    grams: z.number().positive().max(5000),
    meal_type: meal,
    log_date: date,
  })
  .strict();
const quickAdd = z
  .object({
    custom_name: z.string().trim().min(1).max(80),
    kcal: z.number().min(0).max(20000),
    meal_type: meal,
    log_date: date,
  })
  .strict();
const createBody = z.union([fromFood, quickAdd]);

const patchBody = z
  .object({
    meal_type: meal,
    log_date: date,
    /** Food entries only: rescales the stored macros to the new amount. */
    grams: z.number().positive().max(5000),
    /** Quick adds only. */
    kcal: z.number().min(0).max(20000),
    custom_name: z.string().trim().min(1).max(80),
  })
  .partial()
  .strict();

const LOG_SELECT = `select l.id, to_char(l.log_date, 'YYYY-MM-DD') as log_date, l.meal_type, l.food_id,
                           l.custom_name as name, f.name_ar, l.grams, l.kcal, l.protein_g, l.carbs_g, l.fat_g
                    from food_logs l left join foods f on f.id = l.food_id`;

type Entry = Macros & {
  id: string;
  log_date: string;
  meal_type: string;
  food_id: string | null;
  name: string;
  name_ar: string | null;
  grams: number | null;
};

async function loadEntry(q: Queryable, id: string): Promise<Entry | undefined> {
  const r = await q.query<Entry>(`${LOG_SELECT} where l.id = $1`, [id]);
  return r.rows[0];
}

export function foodLogsRouter({ db, hub }: { db: Db; hub: Hub }) {
  const router = Router();

  // One day: every entry, the totals (computed from the same stored values, so the rows always add up
  // exactly) and the user's goal.
  router.get('/', async (req, res) => {
    const { date: day } = z.object({ date }).parse(req.query);
    const result = await db.asUser(currentUserId(req), async (q) => {
      const entries = await q.query<Entry>(
        `${LOG_SELECT} where l.log_date = $1::date order by l.created_at, l.id`,
        [day],
      );
      const goal = await q.query<{ daily_kcal_goal: number | null }>(
        `select daily_kcal_goal from profiles`,
      );
      return { entries: entries.rows, goal: goal.rows[0]?.daily_kcal_goal ?? null };
    });
    res.json({
      date: day,
      entries: result.entries,
      totals: sumTotals(result.entries),
      goal_kcal: result.goal,
    });
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const entry = await db.asUser(currentUserId(req), (q) => loadEntry(q, id));
    if (!entry) throw new HttpError(404, 'entry_not_found');
    res.json(entry);
  });

  router.post('/', async (req, res) => {
    const body = createBody.parse(req.body);
    const entry = await db.asUser(currentUserId(req), async (q) => {
      let id: string;
      if ('food_id' in body) {
        const food = await q.query<{
          name: string;
          kcal_per_100g: number;
          protein_g: number;
          carbs_g: number;
          fat_g: number;
        }>(`select name, kcal_per_100g, protein_g, carbs_g, fat_g from foods where id = $1`, [
          body.food_id,
        ]);
        if (!food.rows[0]) throw new HttpError(404, 'food_not_found');
        const m = macrosForGrams(food.rows[0], body.grams);
        const r = await q.query<{ id: string }>(
          // The name is stored too: history keeps its text even if the food is later renamed or removed.
          `insert into food_logs (user_id, log_date, meal_type, food_id, custom_name, grams, kcal, protein_g, carbs_g, fat_g)
           values (app.uid(), $1::date, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
          [
            body.log_date,
            body.meal_type,
            body.food_id,
            food.rows[0].name,
            body.grams,
            m.kcal,
            m.protein_g,
            m.carbs_g,
            m.fat_g,
          ],
        );
        id = r.rows[0]!.id;
      } else {
        const r = await q.query<{ id: string }>(
          `insert into food_logs (user_id, log_date, meal_type, custom_name, kcal)
           values (app.uid(), $1::date, $2, $3, $4) returning id`,
          [body.log_date, body.meal_type, body.custom_name, Math.round(body.kcal)],
        );
        id = r.rows[0]!.id;
      }
      return loadEntry(q, id);
    });
    await notifyUserChallenges(db, hub, currentUserId(req));
    res.status(201).json(entry);
  });

  router.patch('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const patch = patchBody.parse(req.body);
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'nothing_to_update');

    const entry = await db.asUser(currentUserId(req), async (q) => {
      const current = await loadEntry(q, id);
      if (!current) throw new HttpError(404, 'entry_not_found');
      const isFood = current.food_id !== null || current.grams !== null;

      const changes: Record<string, unknown> = {};
      if (patch.meal_type) changes.meal_type = patch.meal_type;
      if (patch.log_date) changes.log_date = patch.log_date;

      if (patch.grams !== undefined) {
        if (!isFood || !current.grams)
          throw new HttpError(400, 'not_a_food_entry', 'Only food entries have grams');
        const m = scaleMacros(current, patch.grams / current.grams);
        Object.assign(changes, {
          grams: patch.grams,
          kcal: m.kcal,
          protein_g: m.protein_g,
          carbs_g: m.carbs_g,
          fat_g: m.fat_g,
        });
      }
      if (patch.kcal !== undefined || patch.custom_name !== undefined) {
        if (isFood)
          throw new HttpError(
            400,
            'not_a_quick_entry',
            'Only quick adds can change calories or name',
          );
        if (patch.kcal !== undefined) changes.kcal = Math.round(patch.kcal);
        if (patch.custom_name !== undefined) changes.custom_name = patch.custom_name;
      }

      // Column names come from the fixed keys assigned above, never from request input.
      const columns = Object.keys(changes);
      await q.query(
        `update food_logs set ${columns.map((c, i) => `${c} = $${i + 1}${c === 'log_date' ? '::date' : ''}`).join(', ')}
         where id = $${columns.length + 1}`,
        [...Object.values(changes), id],
      );
      return loadEntry(q, id);
    });
    await notifyUserChallenges(db, hub, currentUserId(req));
    res.json(entry);
  });

  router.delete('/:id', async (req, res) => {
    const { id } = idParam.parse(req.params);
    const removed = await db.asUser(currentUserId(req), async (q) => {
      const r = await q.query(`delete from food_logs where id = $1 returning id`, [id]);
      return r.rows.length > 0;
    });
    if (!removed) throw new HttpError(404, 'entry_not_found');
    await notifyUserChallenges(db, hub, currentUserId(req));
    res.status(204).end();
  });

  return router;
}
