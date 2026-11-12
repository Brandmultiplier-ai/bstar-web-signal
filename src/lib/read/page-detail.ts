import { addDays, inclusiveDays, toDateString } from "../dates";
import { delta, inWindow, sumBy, type Delta, type Window } from "./compare";

/**
 * Everything stored about one page of one site, for the drill-in panel.
 * Pure: the route reads the rows, this folds them. No API is ever called.
 */

export type PageGa4Row = {
  date: string;
  pageviews: number;
  sessions: number;
  users: number;
  engaged_sessions: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
};

export type PageLandingRow = { date: string; sessions: number };

export type PageClarityRow = {
  date: string;
  sessions: number;
  scroll_depth_pct: number | null;
  active_time_seconds: number | null;
  rage_click_pct: number | null;
  dead_click_pct: number | null;
  quick_back_pct: number | null;
  excessive_scroll_pct: number | null;
  script_error_pct: number | null;
};

export type PageKeyEventRow = { date: string; event_key: string; placement: string; count: number };
export type PageSourceRow = { date: string; source: string; medium: string; sessions: number };
export type PageFormRow = {
  form_id: string;
  page_url: string | null;
  submitted_at: string | null;
  received_at: string;
};
export type PageVisitRow = { company: string | null; captured_url: string | null; captured_at: string };

type Readable<T> = { available: true; rows: T[] } | { available: false; reason: string };
type Unavailable = { available: false; reason: string };

export type PageDetailInput = {
  path: string;
  current: Window;
  previous: Window | null;
  ga4: PageGa4Row[];
  landings: PageLandingRow[];
  clarity: PageClarityRow[];
  keyEvents: PageKeyEventRow[];
  sources: Readable<PageSourceRow>;
  forms: Readable<PageFormRow>;
  visits: Readable<PageVisitRow>;
};

export type PageKpiId =
  | "views"
  | "sessions"
  | "users"
  | "engagementRate"
  | "bounceRate"
  | "avgSessionDuration"
  | "landingSessions"
  | "scrollDepthPct"
  | "activeTimeSeconds"
  | "formSubmissions";

export type PageDetail = {
  kpis: Record<PageKpiId, Delta>;
  /** One point per day of the range. Null means no stored row, never zero. */
  daily: Array<{ date: string; views: number | null; sessions: number | null }>;
  coverage: { days: number; ga4Days: number; clarityDays: number };
  behaviour: {
    sessions: number;
    rageClickPct: number | null;
    deadClickPct: number | null;
    quickBackPct: number | null;
    excessiveScrollPct: number | null;
    scriptErrorPct: number | null;
  };
  conversions: Array<{ eventKey: string; placement: string; count: number }>;
  sources: { available: true; rows: Array<{ source: string; medium: string; sessions: number }> } | Unavailable;
  forms: { available: true; submissions: number; byForm: Array<{ name: string; value: number }> } | Unavailable;
  companies:
    | { available: true; visits: number; rows: Array<{ company: string; visits: number; lastSeen: string }> }
    | Unavailable;
};

const MAX_DAILY_POINTS = 366;
const TOP_N = 10;

/**
 * Path only, for matching a full captured URL against a GA4 or Clarity path.
 * Query string and hash are dropped and a trailing slash is ignored.
 */
export function normalisePath(urlOrPath: string | null | undefined): string | null {
  if (!urlOrPath) return null;
  let path = urlOrPath.trim();
  if (/^https?:\/\//i.test(path)) {
    try {
      path = new URL(path).pathname;
    } catch {
      return null;
    }
  }
  path = path.split(/[?#]/)[0] ?? "";
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1) path = path.replace(/\/+$/, "") || "/";
  return path;
}

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

const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

function ranked(totals: Map<string, number>) {
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
    .slice(0, TOP_N);
}

export function buildPageDetail(input: PageDetailInput): PageDetail {
  const { current, previous } = input;
  const target = normalisePath(input.path);
  const split = <T>(rows: T[], dateOf: (row: T) => string) => ({
    now: rows.filter((row) => inWindow(dateOf(row), current)),
    before: previous ? rows.filter((row) => inWindow(dateOf(row), previous)) : [],
  });

  const ga4 = split(input.ga4, (row) => row.date);
  const landings = split(input.landings, (row) => row.date);
  const clarity = split(input.clarity, (row) => row.date);

  const pair = <T>(
    rows: { now: T[]; before: T[] },
    measure: (rows: T[]) => number | null,
  ): Delta =>
    delta(
      rows.now.length ? measure(rows.now) : null,
      previous && rows.before.length ? measure(rows.before) : null,
    );

  const engagement = (rows: PageGa4Row[]) => {
    const sessions = sum(rows, (row) => row.sessions);
    return sessions > 0 ? sum(rows, (row) => row.engaged_sessions) / sessions : null;
  };

  const forms = input.forms.available
    ? input.forms.rows.filter((row) => normalisePath(row.page_url) === target)
    : [];
  const formAt = (row: PageFormRow) => row.submitted_at ?? row.received_at;
  const formSplit = split(forms, formAt);

  const kpis: Record<PageKpiId, Delta> = {
    views: pair(ga4, (rows) => sum(rows, (row) => row.pageviews)),
    sessions: pair(ga4, (rows) => sum(rows, (row) => row.sessions)),
    users: pair(ga4, (rows) => sum(rows, (row) => row.users)),
    engagementRate: pair(ga4, engagement),
    bounceRate: pair(ga4, (rows) => weighted(rows, (row) => row.bounce_rate, (row) => row.sessions)),
    avgSessionDuration: pair(ga4, (rows) =>
      weighted(rows, (row) => row.avg_session_duration, (row) => row.sessions),
    ),
    landingSessions: pair(landings, (rows) => sum(rows, (row) => row.sessions)),
    scrollDepthPct: pair(clarity, (rows) =>
      weighted(rows, (row) => row.scroll_depth_pct, (row) => row.sessions),
    ),
    activeTimeSeconds: pair(clarity, (rows) =>
      weighted(rows, (row) => row.active_time_seconds, (row) => row.sessions),
    ),
    formSubmissions: input.forms.available
      ? delta(formSplit.now.length, previous ? formSplit.before.length : null)
      : delta(null, null),
  };

  const rate = (pick: (row: PageClarityRow) => number | null) =>
    weighted(clarity.now, pick, (row) => row.sessions);

  const conversions = [
    ...sumBy(
      input.keyEvents.filter((row) => inWindow(row.date, current)),
      (row) => `${row.event_key}\u0000${row.placement}`,
      (row) => row.count,
    ).entries(),
  ]
    .map(([key, count]) => {
      const [eventKey, placement] = key.split("\u0000");
      return { eventKey: eventKey ?? "", placement: placement ?? "", count };
    })
    .sort((a, b) => b.count - a.count);

  const sources: PageDetail["sources"] = input.sources.available
    ? {
        available: true,
        rows: [
          ...sumBy(
            input.sources.rows.filter((row) => inWindow(row.date, current)),
            (row) => `${row.source}\u0000${row.medium}`,
            (row) => row.sessions,
          ).entries(),
        ]
          .map(([key, sessions]) => {
            const [source, medium] = key.split("\u0000");
            return { source: source ?? "", medium: medium ?? "", sessions };
          })
          .sort((a, b) => b.sessions - a.sessions)
          .slice(0, TOP_N),
      }
    : { available: false, reason: input.sources.reason };

  const companies: PageDetail["companies"] = input.visits.available
    ? (() => {
        const rows = input.visits.rows.filter(
          (row) => inWindow(row.captured_at, current) && normalisePath(row.captured_url) === target,
        );
        const byCompany = new Map<string, { company: string; visits: number; lastSeen: string }>();
        for (const row of rows) {
          const company = row.company?.trim();
          if (!company) continue;
          const entry = byCompany.get(company) ?? { company, visits: 0, lastSeen: row.captured_at };
          entry.visits += 1;
          if (row.captured_at > entry.lastSeen) entry.lastSeen = row.captured_at;
          byCompany.set(company, entry);
        }
        return {
          available: true as const,
          visits: rows.length,
          rows: [...byCompany.values()]
            .sort((a, b) => b.visits - a.visits || b.lastSeen.localeCompare(a.lastSeen))
            .slice(0, TOP_N),
        };
      })()
    : { available: false, reason: input.visits.reason };

  return {
    kpis,
    daily: dailySeries(current, previous === null, ga4.now),
    coverage: {
      days: inclusiveDays(current.start, current.end),
      ga4Days: new Set(ga4.now.map((row) => row.date.slice(0, 10))).size,
      clarityDays: new Set(clarity.now.map((row) => row.date.slice(0, 10))).size,
    },
    behaviour: {
      sessions: sum(clarity.now, (row) => row.sessions),
      rageClickPct: rate((row) => row.rage_click_pct),
      deadClickPct: rate((row) => row.dead_click_pct),
      quickBackPct: rate((row) => row.quick_back_pct),
      excessiveScrollPct: rate((row) => row.excessive_scroll_pct),
      scriptErrorPct: rate((row) => row.script_error_pct),
    },
    conversions,
    sources,
    forms: input.forms.available
      ? {
          available: true,
          submissions: formSplit.now.length,
          byForm: ranked(sumBy(formSplit.now, (row) => row.form_id, () => 1)),
        }
      : { available: false, reason: input.forms.reason },
    companies,
  };
}

/** An all-time range starts at the first stored day rather than at the epoch. */
function dailySeries(current: Window, allTime: boolean, rows: PageGa4Row[]) {
  const views = sumBy(rows, (row) => row.date.slice(0, 10), (row) => row.pageviews);
  const sessions = sumBy(rows, (row) => row.date.slice(0, 10), (row) => row.sessions);
  const first = allTime ? ([...views.keys()].sort()[0] ?? current.end) : current.start;
  const days = Math.min(inclusiveDays(first, current.end), MAX_DAILY_POINTS);
  const end = new Date(`${current.end}T00:00:00Z`);
  return Array.from({ length: days }, (_, i) => {
    const date = toDateString(addDays(end, i - days + 1));
    return { date, views: views.get(date) ?? null, sessions: sessions.get(date) ?? null };
  });
}
