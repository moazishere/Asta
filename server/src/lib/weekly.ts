export type DayRow = { day: string; distance_m: number; runs: number; moving_time_s: number };
export type Totals = { distance_m: number; runs: number; moving_time_s: number };

export type WeeklyStats = {
  /** Monday of the week shown, as YYYY-MM-DD in the user's time zone. */
  weekStart: string;
  /** The user's "today" (YYYY-MM-DD) in their time zone, so the app can highlight it. */
  today: string;
  thisWeek: Totals;
  lastWeek: Totals;
  /** Seven entries, Monday first, including days with no runs. */
  days: { date: string; distance_m: number; runs: number }[];
};

/** Adds whole days to a YYYY-MM-DD string. Pure calendar arithmetic (UTC), immune to DST and time zones. */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const isValidDate = (date: string): boolean =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) &&
  addDays(date, 0) === date;

const sum = (rows: DayRow[]): Totals => ({
  distance_m: Math.round(rows.reduce((t, r) => t + r.distance_m, 0) * 10) / 10,
  runs: rows.reduce((t, r) => t + r.runs, 0),
  moving_time_s: rows.reduce((t, r) => t + r.moving_time_s, 0),
});

/**
 * Turns per-day totals (any days; only the two weeks around `weekStart` matter) into the weekly view:
 * this week, last week and a zero-filled 7-day series. Days are already in the user's time zone.
 */
export function buildWeekly(rows: DayRow[], weekStart: string, today: string): WeeklyStats {
  const lastWeekStart = addDays(weekStart, -7);
  const weekEnd = addDays(weekStart, 6);
  const thisWeekRows = rows.filter((r) => r.day >= weekStart && r.day <= weekEnd);
  const lastWeekRows = rows.filter((r) => r.day >= lastWeekStart && r.day < weekStart);

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i);
    const row = thisWeekRows.find((r) => r.day === date);
    return { date, distance_m: row?.distance_m ?? 0, runs: row?.runs ?? 0 };
  });
  return { weekStart, today, thisWeek: sum(thisWeekRows), lastWeek: sum(lastWeekRows), days };
}
