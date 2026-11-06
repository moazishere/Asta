import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import type { Queryable } from '../db.js';

const foodSchema = z.object({
  name: z.string().min(1).max(80),
  name_ar: z.string().max(80).nullable().optional(),
  kcal_per_100g: z.number().min(0).max(1000),
  protein_g: z.number().min(0).max(100),
  carbs_g: z.number().min(0).max(100),
  fat_g: z.number().min(0).max(100),
  serving_g: z.number().positive().max(2000).nullable().optional(),
});
export type SeedFood = z.infer<typeof foodSchema>;

const fileSchema = z.object({ foods: z.array(foodSchema).min(1) });

export const FOODS_FILE = fileURLToPath(new URL('../../data/foods.json', import.meta.url));

/** Reads and validates server/data/foods.json. Throws with a readable message if an entry is wrong. */
export function loadSeedFoods(path = FOODS_FILE): SeedFood[] {
  return fileSchema.parse(JSON.parse(readFileSync(path, 'utf8'))).foods;
}

/**
 * Inserts or updates the shared starter foods (source 'custom', no owner), matched by name. Safe to
 * run again after editing foods.json. Foods created by users are never touched.
 */
export async function seedFoods(q: Queryable, foods: SeedFood[]): Promise<number> {
  for (const f of foods) {
    await q.query(
      `insert into foods (name, name_ar, kcal_per_100g, protein_g, carbs_g, fat_g, serving_g, source)
       values ($1, $2, $3, $4, $5, $6, $7, 'custom')
       on conflict (lower(name)) where source <> 'user'
       do update set name_ar = excluded.name_ar, kcal_per_100g = excluded.kcal_per_100g,
                     protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
                     fat_g = excluded.fat_g, serving_g = excluded.serving_g`,
      [
        f.name,
        f.name_ar ?? null,
        f.kcal_per_100g,
        f.protein_g,
        f.carbs_g,
        f.fat_g,
        f.serving_g ?? null,
      ],
    );
  }
  return foods.length;
}
