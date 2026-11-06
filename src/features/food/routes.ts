import type { Href } from 'expo-router';

import type { MealType } from './types';

// Typed routes are generated while the dev server runs, so routes added since the last start are not
// in the generated types yet. Building hrefs in one place keeps the casts out of the screens.
export const addFoodHref = (date: string, meal: MealType) =>
  `/food-log/add?date=${encodeURIComponent(date)}&meal=${meal}` as Href;

export const amountHref = (foodId: string, date: string, meal: MealType) =>
  `/food-log/amount?foodId=${encodeURIComponent(foodId)}&date=${encodeURIComponent(date)}&meal=${meal}` as Href;

export const entryHref = (id: string) => `/food-log/${encodeURIComponent(id)}` as Href;
