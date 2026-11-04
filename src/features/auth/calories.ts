import type { Sex } from './types';

type Input = { sex: Sex; weightKg: number; heightCm: number; birthYear: number; now?: Date };

// Mifflin-St Jeor basal metabolic rate, multiplied by 1.375 ("light activity: exercise 1-3 days/week"),
// rounded to the nearest 10 kcal. It is only a starting suggestion; the user can override it.
export function suggestDailyKcal({ sex, weightKg, heightCm, birthYear, now = new Date() }: Input) {
  const age = now.getFullYear() - birthYear;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const kcal = Math.round((bmr * 1.375) / 10) * 10;
  return Math.min(5000, Math.max(1200, kcal));
}
