// Pure food-log helpers: no React, no native modules, unit tested. The macro maths mirrors
// server/src/lib/nutrition.ts, so an optimistic (instant) update shows the same numbers the server
// will confirm a moment later.
import type { LogEntry, Macros, MealType } from './types';

export const MEALS: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const round1 = (n: number) => Math.round(n * 10) / 10;

type Per100g = { kcal_per_100g: number; protein_g: number; carbs_g: number; fat_g: number };

/** Macros for `grams` of a food: whole kcal, macros to 0.1 g. */
export function macrosForGrams(food: Per100g, grams: number): Macros {
  const f = grams / 100;
  return {
    kcal: Math.round(food.kcal_per_100g * f),
    protein_g: round1(food.protein_g * f),
    carbs_g: round1(food.carbs_g * f),
    fat_g: round1(food.fat_g * f),
  };
}

/** Rescales an existing entry to a new amount, keeping its stored snapshot as the base. */
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

/** Entries grouped by meal, in breakfast/lunch/dinner/snack order, each with its calorie subtotal. */
export function groupByMeal(
  entries: LogEntry[],
): { meal: MealType; entries: LogEntry[]; kcal: number }[] {
  return MEALS.map((meal) => {
    const list = entries.filter((e) => e.meal_type === meal);
    return { meal, entries: list, kcal: list.reduce((t, e) => t + e.kcal, 0) };
  });
}

/** Parses a user-typed number ("12,5" or "12.5"). Returns NaN for empty or invalid text. */
export function parseNumber(text: string): number {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? NaN : Number(trimmed);
}

/** Calories left (positive) or over (negative) against a goal; null when there is no goal. */
export function kcalRemaining(goal: number | null, consumed: number): number | null {
  return goal == null || goal <= 0 ? null : goal - consumed;
}

/** Ring progress 0..1 (capped at a full ring), 0 without a goal. */
export function goalProgress(goal: number | null, consumed: number): number {
  if (goal == null || goal <= 0) return 0;
  return Math.min(1, Math.max(0, consumed / goal));
}

/** Shows the Arabic name when the phone is set to Arabic and one exists, otherwise the English name. */
export function pickName(item: { name: string; name_ar: string | null }, locale: string): string {
  return locale.toLowerCase().startsWith('ar') && item.name_ar ? item.name_ar : item.name;
}

// ---- calendar dates (YYYY-MM-DD strings, no time zones involved) --------------------------------

/** Adds whole days to a YYYY-MM-DD string. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Today's date (YYYY-MM-DD) in the given IANA time zone, falling back to the phone's own zone. */
export function todayIn(timeZone: string | undefined, now: Date = new Date()): string {
  const read = (zone?: string) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  try {
    return read(timeZone);
  } catch {
    return read(undefined);
  }
}

export type DayRelation = 'today' | 'yesterday' | 'tomorrow' | 'other';

export function relationToToday(date: string, today: string): DayRelation {
  if (date === today) return 'today';
  if (date === addDays(today, -1)) return 'yesterday';
  if (date === addDays(today, 1)) return 'tomorrow';
  return 'other';
}
