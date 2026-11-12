import { addDays, inclusiveDays, toDateString } from "../dates";
import { sourceLabel, type SourceLabel } from "../source-labels";
import { delta, inWindow, sumBy, type Delta, type Window } from "./compare";

/**
 * Everything stored about one traffic source (a GA4 source / medium pair) on
 * one site: how many visits it sent, and which pages those visits started on.
 * Pure: the route reads the rows, this folds them.
 */

export type SourceDailyRow = { date: string; sessions: number; users: number };
export type SiteDailyRow = { date: string; sessions: number };
export type SourceLandingRow = { date: string; page_path: string; sessions: number; users: number };
export type LandingEngagementRow = {
  date: string;
  page_path: string;
  sessions: number;
  engaged_sessions: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
};

type Unavailable = { available: false; reason: string };

export type SourceDetailInput = {
  source: string;
  medium: string;
  current: Window;
  previous: Window | null;
  totals: SourceDailyRow[];
  site: SiteDailyRow[];
  landings: { available: true; rows: SourceLandingRow[] } | Unavailable;
  engagement: LandingEngagementRow[];
};

export type SourcePageRow = {
  path: string;
  sessions: number;
  users: number;
  /** Share of this source's landing sessions that started on this page. */
  share: number;
  /** For every visit that started on the page, from any source. */
  pageEngagementRate: number | null;
  pageBounceRate: number | null;
  pageAvgSessionDuration: number | null;
};

export type SourceDetail = {
  label: SourceLabel;
  kpis: { sessions: Delta; users: Delta; share: Delta };
  daily: Array<{ date: string; sessions: number | null }>;
  coverage: { days: number; storedDays: number };
  pages: { available: true; rows: SourcePageRow[]; sessions: number } | Unavailable;
  summary: string[];
};

const TOP_PAGES = 25;
const MAX_DAILY_POINTS = 366;

const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);
const pct = (value: number) => `${Math.round(value * 100)}%`;

function weighted<T>(rows: T[], value: (row: T) => number | null, weight: (row: T) => number) {
  let w = 0;
  let total = 0;
  for (const row of rows) {
    const v = value(row);
    if (v === null) continue;
    const rowWeight = weight(row) > 0 ? weight(row) : 1;
    w += rowWeight;
    total += v * rowWeight;
  }
  return w > 0 ? total / w : null;
}

export function buildSourceDetail(input: SourceDetailInput): SourceDetail {
  const { current, previous } = input;
  const label = sourceLabel(input.source, input.medium);
  const now = input.totals.filter((row) => inWindow(row.date, current));
  const before = previous ? input.totals.filter((row) => inWindow(row.date, previous)) : [];
  const siteNow = sum(input.site.filter((row) => inWindow(row.date, current)), (row) => row.sessions);
  const siteBefore = previous ? sum(input.site.filter((row) => inWindow(row.date, previous)), (row) => row.sessions) : 0;

  const sessionsNow = now.length ? sum(now, (row) => row.sessions) : null;
  const sessionsBefore = previous && before.length ? sum(before, (row) => row.sessions) : null;
  const kpis = {
    sessions: delta(sessionsNow, sessionsBefore),
    users: delta(now.length ? sum(now, (row) => row.users) : null, previous && before.length ? sum(before, (row) => row.users) : null),
    share: delta(
      sessionsNow !== null && siteNow > 0 ? sessionsNow / siteNow : null,
      sessionsBefore !== null && siteBefore > 0 ? sessionsBefore / siteBefore : null,
    ),
  };

  const pages: SourceDetail["pages"] = input.landings.available
    ? (() => {
        const rows = input.landings.rows.filter((row) => inWindow(row.date, current));
        const total = sum(rows, (row) => row.sessions);
        const sessions = sumBy(rows, (row) => row.page_path, (row) => row.sessions);
        const users = sumBy(rows, (row) => row.page_path, (row) => row.users);
        const engagement = input.engagement.filter((row) => inWindow(row.date, current));
        return {
          available: true as const,
          sessions: total,
          rows: [...sessions.entries()]
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .slice(0, TOP_PAGES)
            .map(([path, count]) => {
              const page = engagement.filter((row) => row.page_path === path);
              const pageSessions = sum(page, (row) => row.sessions);
              return {
                path,
                sessions: count,
                users: users.get(path) ?? 0,
                share: total > 0 ? count / total : 0,
                pageEngagementRate: pageSessions > 0 ? sum(page, (row) => row.engaged_sessions) / pageSessions : null,
                pageBounceRate: weighted(page, (row) => row.bounce_rate, (row) => row.sessions),
                pageAvgSessionDuration: weighted(page, (row) => row.avg_session_duration, (row) => row.sessions),
              };
            }),
        };
      })()
    : { available: false, reason: input.landings.reason };

  const days = inclusiveDays(current.start, current.end);
  const summary: string[] = [];
  if (sessionsNow !== null && sessionsNow > 0) {
    const share = kpis.share.current;
    summary.push(
      `${label.name} sent ${sessionsNow.toLocaleString("en-US")} visit${sessionsNow === 1 ? "" : "s"} over ${days} day${days === 1 ? "" : "s"}${
        share !== null ? `, ${pct(share)} of all visits to the site` : ""
      }.`,
    );
  }
  summary.push(label.explain);
  if (pages.available && pages.rows[0] && pages.sessions > 0) {
    const top = pages.rows[0];
    summary.push(
      pages.rows.length === 1
        ? `Every visit from this source that we stored started on ${top.path}.`
        : `${pct(top.share)} of these visits started on ${top.path}.`,
    );
  }

  return {
    label,
    kpis,
    daily: dailySeries(current, previous === null, now),
    coverage: { days, storedDays: new Set(now.map((row) => row.date.slice(0, 10))).size },
    pages,
    summary,
  };
}

/** An all-time range starts at the first stored day rather than at the epoch. */
function dailySeries(current: Window, allTime: boolean, rows: SourceDailyRow[]) {
  const sessions = sumBy(rows, (row) => row.date.slice(0, 10), (row) => row.sessions);
  const first = allTime ? ([...sessions.keys()].sort()[0] ?? current.end) : current.start;
  const days = Math.min(inclusiveDays(first, current.end), MAX_DAILY_POINTS);
  const end = new Date(`${current.end}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const date = toDateString(addDays(end, i - days + 1));
    return { date, sessions: sessions.get(date) ?? null };
  });
}
