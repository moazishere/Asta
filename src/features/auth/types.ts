export type Sex = 'male' | 'female';

// Mirrors public.profiles (supabase/migrations/0001_core_tables.sql).
export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  height_cm: number | null;
  weight_kg: number | null;
  birth_year: number | null;
  sex: Sex | null;
  daily_kcal_goal: number | null;
  timezone: string;
  onboarded_at: string | null;
};
