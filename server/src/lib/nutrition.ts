// Nutrition maths shared by the food-log routes. (The app has its own copy in
// src/features/food/nutrition.ts for instant optimistic updates; both are unit tested.)

export type Per100g = {
  kcal_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
};

/** What one log entry stores. kcal is a whole number so rows and daily totals always add up exactly. */
export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Macros for `grams` of a food. kcal is rounded to whole kcal, macros to 0.1 g. */
export function macrosForGrams(food: Per100g, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round(food.kcal_per_100g * f),
    protein_g: round1(food.protein_g * f),
    carbs_g: round1(food.carbs_g * f),
    fat_g: round1(food.fat_g * f),
  };
}

/** Rescales an existing snapshot to a new amount (editing grams). The original food is not re-read. */
export function scaleMacros(m: Macros, factor: number): Macros {
  return {
    kcal: Math.round(m.kcal * factor),
    protein_g: round1(m.protein_g * factor),
    carbs_g: round1(m.carbs_g * factor),
    fat_g: round1(m.fat_g * factor),
  };
}

export function sumTotals(rows: Macros[]): Macros {
  return {
    kcal: rows.reduce((t, r) => t + r.kcal, 0),
    protein_g: round1(rows.reduce((t, r) => t + r.protein_g, 0)),
    carbs_g: round1(rows.reduce((t, r) => t + r.carbs_g, 0)),
    fat_g: round1(rows.reduce((t, r) => t + r.fat_g, 0)),
  };
}
