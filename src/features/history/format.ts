// Date formatting in the user's own time zone, so a run shows on the same day that the weekly totals
// counted it in (the server buckets days with profiles.timezone too).

function format(iso: string, options: Intl.DateTimeFormatOptions, timeZone?: string): string {
  const date = new Date(iso);
  try {
    return date.toLocaleDateString(undefined, { ...options, timeZone });
  } catch {
    // Unknown time zone name on this device: fall back to the phone's own zone rather than crash.
    return date.toLocaleDateString(undefined, options);
  }
}

/** "Wed, 5 Nov" */
export function formatRunDate(iso: string, timeZone?: string): string {
  return format(iso, { weekday: 'short', day: 'numeric', month: 'short' }, timeZone);
}

/** "06:15" (24h or 12h following the phone's locale). */
export function formatRunTime(iso: string, timeZone?: string): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = { hour: '2-digit', minute: '2-digit' };
  try {
    return date.toLocaleTimeString(undefined, { ...options, timeZone });
  } catch {
    return date.toLocaleTimeString(undefined, options);
  }
}

/** One-letter weekday for a YYYY-MM-DD calendar date, independent of any time zone ("M", "T", ...). */
export function weekdayLetter(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'narrow',
    timeZone: 'UTC',
  });
}

/** Full weekday name for screen readers. */
export function weekdayName(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    timeZone: 'UTC',
  });
}
