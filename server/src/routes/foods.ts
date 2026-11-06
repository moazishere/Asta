import { Router } from 'express';
import { z } from 'zod';

import type { Db } from '../db.js';
import { HttpError, isUniqueViolation } from '../errors.js';
import { currentUserId } from '../middleware/auth.js';

const FOOD_COLUMNS = `id, name, name_ar, kcal_per_100g, protein_g, carbs_g, fat_g, serving_g, source,
  coalesce(created_by = app.uid(), false) as mine`;

const searchQuery = z.object({
  q: z.string().trim().max(60).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

/** Escapes LIKE wildcards so searching for "50%" or "a_b" matches those characters literally. */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

const createBody = z
  .object({
    name: z.string().trim().min(1).max(80),
    name_ar: z.string().trim().max(80).nullable().optional(),
    kcal_per_100g: z.number().min(0).max(1000),
    protein_g: z.number().min(0).max(100).default(0),
    carbs_g: z.number().min(0).max(100).default(0),
    fat_g: z.number().min(0).max(100).default(0),
    /** Typical portion in grams, for the "1 serving" shortcut. */
    serving_g: z.number().positive().max(2000).nullable().optional(),
  })
  // Unknown keys (source, created_by, id...) are rejected: a client can only ever create its own foods.
  .strict()
  // 100 g of food cannot contain more than 100 g of macros (small slack for rounding).
  .refine(
    (f) => f.protein_g + f.carbs_g + f.fat_g <= 100.5,
    'Macros cannot add up to more than 100 g per 100 g',
  );

export function foodsRouter({ db }: { db: Db }) {
  const router = Router();

  // Search by English or Arabic name. Prefix matches first, then the user's own foods, then A-Z.
  router.get('/', async (req, res) => {
    const { q, limit } = searchQuery.parse(req.query);
    const term = escapeLike(q.toLowerCase());
    const foods = await db.asUser(currentUserId(req), async (rows) => {
      const result = await rows.query(
        `select ${FOOD_COLUMNS} from foods
         where $1 = '' or lower(name) like $2 escape '\\' or name_ar like $2 escape '\\'
         order by case when $1 <> '' and (lower(name) like $3 escape '\\' or name_ar like $3 escape '\\') then 0 else 1 end,
                  coalesce(created_by = app.uid(), false) desc,
                  name
         limit $4`,
        [q, `%${term}%`, `${term}%`, limit],
      );
      return result.rows;
    });
    res.json({ items: foods });
  });

  router.post('/', async (req, res) => {
    const body = createBody.parse(req.body);
    try {
      const food = await db.asUser(currentUserId(req), async (q) => {
        const r = await q.query(
          `insert into foods (name, name_ar, kcal_per_100g, protein_g, carbs_g, fat_g, serving_g, source, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, 'user', app.uid())
           returning ${FOOD_COLUMNS}`,
          [
            body.name,
            body.name_ar || null,
            body.kcal_per_100g,
            body.protein_g,
            body.carbs_g,
            body.fat_g,
            body.serving_g ?? null,
          ],
        );
        return r.rows[0];
      });
      res.status(201).json(food);
    } catch (err) {
      if (isUniqueViolation(err))
        throw new HttpError(409, 'food_exists', 'You already have a food with that name');
      throw err;
    }
  });

  router.get('/:id', async (req, res) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const food = await db.asUser(currentUserId(req), async (q) => {
      const r = await q.query(`select ${FOOD_COLUMNS} from foods where id = $1`, [id]);
      return r.rows[0];
    });
    // Row Level Security hides other users' custom foods, so they are simply "not found".
    if (!food) throw new HttpError(404, 'food_not_found');
    res.json(food);
  });

  return router;
}
