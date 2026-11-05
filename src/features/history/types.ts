// Shapes returned by the API (server/src/routes/runs.ts and stats.ts).

export type RunSummary = {
  id: string;
  started_at: string;
  ended_at: string;
  distance_m: number;
  moving_time_s: number;
  avg_pace_s_per_km: number | null;
  kcal_est: number | null;
  suspicious: boolean;
  /** Encoded polyline of the simplified route. */
  route_polyline: string | null;
};

export type Split = {
  km: number;
  distance_m: number;
  duration_s: number;
  pace_s_per_km: number | null;
};

export type RunDetail = RunSummary & { splits: Split[] };

export type RunsPage = { items: RunSummary[]; nextCursor: string | null };

export type Totals = { distance_m: number; runs: number; moving_time_s: number };

export type WeeklyStats = {
  weekStart: string;
  today: string;
  thisWeek: Totals;
  lastWeek: Totals;
  days: { date: string; distance_m: number; runs: number }[];
};
