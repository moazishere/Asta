// Shapes returned by the API (server/src/routes/foods.ts and foodLogs.ts).

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type Food = {
  id: string;
  name: string;
  name_ar: string | null;
  kcal_per_100g: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  serving_g: number | null;
  source: 'custom' | 'off' | 'user';
  /** True for foods the signed-in user created. */
  mine: boolean;
};

export type Macros = { kcal: number; protein_g: number; carbs_g: number; fat_g: number };

export type LogEntry = Macros & {
  id: string;
  log_date: string;
  meal_type: MealType;
  food_id: string | null;
  name: string;
  name_ar: string | null;
  /** Null for quick adds. */
  grams: number | null;
};

export type DayLog = {
  date: string;
  entries: LogEntry[];
  totals: Macros;
  goal_kcal: number | null;
};
