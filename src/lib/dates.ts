/**
 * Date helpers. Everything the ingest and read layers exchange is a plain
 * `YYYY-MM-DD` string in UTC, matching the `date` columns in Postgres and the
 * format GA4, Search Console and Clarity all accept.
 */

export function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The window a scheduled pull covers: `lookbackDays` back through yesterday.
 * Today is excluded because none of these APIs report a complete current day.
 */
export function ingestWindow(lookbackDays: number): { start: string; end: string } {
  const end = addDays(todayUtc(), -1);
  const start = addDays(end, -(lookbackDays - 1));
  return { start: toDateString(start), end: toDateString(end) };
}

/** Inclusive list of dates between two `YYYY-MM-DD` strings. */
export function dateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (cursor <= last) {
    dates.push(toDateString(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

/** GA4 returns dates as `YYYYMMDD`. */
export function fromCompactDate(compact: string): string {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

export function daysSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const days = daysSince(iso);
  if (days < 1 / 24) return "just now";
  if (days < 1) {
    const hours = Math.round(days * 24);
    return `${hours}h ago`;
  }
  const whole = Math.round(days);
  return whole === 1 ? "1 day ago" : `${whole} days ago`;
}

/** Floor used when the dashboard asks for every stored day. */
export const ALL_TIME_START = "2015-01-01";

/** Inclusive number of calendar days between two `YYYY-MM-DD` strings. */
export function inclusiveDays(start: string, end: string): number {
  const from = Date.parse(`${start}T00:00:00Z`);
  const to = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1;
  return Math.round((to - from) / 86_400_000) + 1;
}

/**
 * Yesterday in UTC — the last complete day any of these APIs report.
 * Custom pickers and read windows both stop here.
 */
export function latestCompleteDay(): string {
  return toDateString(addDays(todayUtc(), -1));
}

/** Clamps a user-picked window to a complete day, max one year, start ≤ end. */
export function clampReadRange(
  start: string,
  end: string,
  maxDays = 365,
): { start: string; end: string } {
  const yesterday = latestCompleteDay();
  let from = start;
  let to = end;
  if (to < from) {
    const swap = from;
    from = to;
    to = swap;
  }
  if (to > yesterday) to = yesterday;
  if (from > to) from = to;
  if (inclusiveDays(from, to) > maxDays) {
    from = toDateString(addDays(new Date(`${to}T00:00:00Z`), -(maxDays - 1)));
  }
  return { start: from, end: to };
}
