import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  addDays,
  goalProgress,
  groupByMeal,
  kcalRemaining,
  macrosForGrams,
  parseNumber,
  pickName,
  relationToToday,
  scaleMacros,
  sumTotals,
  todayIn,
} from './nutrition';
import type { LogEntry } from './types';

const entry = (over: Partial<LogEntry>): LogEntry => ({
  id: 'x',
  log_date: '2026-11-05',
  meal_type: 'lunch',
  food_id: null,
  name: 'Thing',
  name_ar: null,
  grams: null,
  kcal: 0,
  protein_g: 0,
  carbs_g: 0,
  fat_g: 0,
  ...over,
});

describe('macros', () => {
  const hummus = { kcal_per_100g: 166, protein_g: 8, carbs_g: 14, fat_g: 10 };
  it('scales per-100 g values to an amount (same result as the server)', () => {
    assert.deepEqual(macrosForGrams(hummus, 60), {
      kcal: 100,
      protein_g: 4.8,
      carbs_g: 8.4,
      fat_g: 6,
    });
    assert.deepEqual(macrosForGrams(hummus, 100), {
      kcal: 166,
      protein_g: 8,
      carbs_g: 14,
      fat_g: 10,
    });
    assert.deepEqual(macrosForGrams(hummus, 0), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
  it('rescales a stored entry when its amount changes', () => {
    assert.deepEqual(scaleMacros({ kcal: 100, protein_g: 4.8, carbs_g: 8.4, fat_g: 6 }, 2), {
      kcal: 200,
      protein_g: 9.6,
      carbs_g: 16.8,
      fat_g: 12,
    });
  });
  it('totals are exact sums with no floating-point noise', () => {
    const t = sumTotals([
      { kcal: 101, protein_g: 0.1, carbs_g: 0.2, fat_g: 0.3 },
      { kcal: 202, protein_g: 0.2, carbs_g: 0.1, fat_g: 0.4 },
    ]);
    assert.deepEqual(t, { kcal: 303, protein_g: 0.3, carbs_g: 0.3, fat_g: 0.7 });
    assert.deepEqual(sumTotals([]), { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('groupByMeal', () => {
  it('orders meals breakfast, lunch, dinner, snack and subtotals each', () => {
    const groups = groupByMeal([
      entry({ id: '1', meal_type: 'snack', kcal: 90 }),
      entry({ id: '2', meal_type: 'breakfast', kcal: 300 }),
      entry({ id: '3', meal_type: 'breakfast', kcal: 120 }),
    ]);
    assert.deepEqual(
      groups.map((g) => g.meal),
      ['breakfast', 'lunch', 'dinner', 'snack'],
    );
    assert.deepEqual(
      groups.map((g) => g.kcal),
      [420, 0, 0, 90],
    );
    assert.equal(groups[0]!.entries.length, 2);
    assert.equal(groups[1]!.entries.length, 0);
  });
  it('subtotals add up to the day total', () => {
    const entries = [
      entry({ meal_type: 'lunch', kcal: 410 }),
      entry({ meal_type: 'dinner', kcal: 515 }),
    ];
    const fromGroups = groupByMeal(entries).reduce((t, g) => t + g.kcal, 0);
    assert.equal(fromGroups, sumTotals(entries).kcal);
  });
});

describe('goal helpers', () => {
  it('computes calories left or over', () => {
    assert.equal(kcalRemaining(2000, 1500), 500);
    assert.equal(kcalRemaining(2000, 2300), -300);
    assert.equal(kcalRemaining(null, 100), null);
    assert.equal(kcalRemaining(0, 100), null);
  });
  it('caps ring progress and handles a missing goal', () => {
    assert.equal(goalProgress(2000, 1000), 0.5);
    assert.equal(goalProgress(2000, 3000), 1);
    assert.equal(goalProgress(null, 500), 0);
    assert.equal(goalProgress(2000, 0), 0);
  });
});

describe('parseNumber', () => {
  it('accepts dots and decimal commas and rejects junk', () => {
    assert.equal(parseNumber('12.5'), 12.5);
    assert.equal(parseNumber(' 12,5 '), 12.5);
    assert.ok(Number.isNaN(parseNumber('')));
    assert.ok(Number.isNaN(parseNumber('abc')));
  });
});

describe('pickName', () => {
  const food = { name: 'Hummus', name_ar: 'حمص' };
  it('prefers Arabic only for Arabic locales that have an Arabic name', () => {
    assert.equal(pickName(food, 'ar-SY'), 'حمص');
    assert.equal(pickName(food, 'en-US'), 'Hummus');
    assert.equal(pickName({ name: 'Cake', name_ar: null }, 'ar'), 'Cake');
  });
});

describe('calendar dates', () => {
  it('adds days across month and year boundaries', () => {
    assert.equal(addDays('2026-11-30', 1), '2026-12-01');
    assert.equal(addDays('2026-01-01', -1), '2025-12-31');
    assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  });
  it('reads "today" in the user’s time zone, not the phone’s or UTC', () => {
    const instant = new Date('2026-11-05T22:30:00Z'); // 01:30 on the 6th in Damascus (UTC+3)
    assert.equal(todayIn('Asia/Damascus', instant), '2026-11-06');
    assert.equal(todayIn('UTC', instant), '2026-11-05');
    assert.equal(todayIn('America/Los_Angeles', instant), '2026-11-05');
  });
  it('falls back instead of crashing on an unknown time zone', () => {
    assert.match(todayIn('Mars/Olympus', new Date('2026-11-05T12:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
  });
  it('labels days relative to today', () => {
    assert.equal(relationToToday('2026-11-05', '2026-11-05'), 'today');
    assert.equal(relationToToday('2026-11-04', '2026-11-05'), 'yesterday');
    assert.equal(relationToToday('2026-11-06', '2026-11-05'), 'tomorrow');
    assert.equal(relationToToday('2026-10-01', '2026-11-05'), 'other');
  });
});
