import { addDays, toDateString } from "@/lib/dates";
import { overviewTldr } from "@/lib/summaries";
import { countryCentroid, flagEmoji } from "@/lib/countries";
import type { ClarityPageDaily, Ga4EventKey } from "@/lib/database.types";
import type {
  CountryRow,
  FunnelStep,
  KPIMetric,
  TopPage,
  WebsiteData,
} from "@/website-signals-kit/lib/types";
import type { ReaderClient } from "@/lib/supabase/types";

/**
 * Assembles the kit's `WebsiteData` from our own tables. Nothing here calls a
 * third-party API — every number comes from a scheduled ingest.
 *
 * Fields the kit treats as optional are deliberately left undefined when no
 * API we pull can supply them, which makes the section hide that panel rather
 * than render a fabricated value. That covers the TLDR narrative, Clarity
 * session recordings, reading-behavior buckets, and per-page scroll/exit rate.
 */

const TOP_PAGES = 8;
const TOP_SOURCES = 6;
const TOP_COUNTRIES = 12;

/**
 * The funnel's logical order, from arrival to booking intent. Fixed rather
 * than sorted by volume, because sorting by count would manufacture a clean
 * funnel shape out of whatever the numbers happened to be.
 */
const FUNNEL_ORDER: Array<{ key: Ga4EventKey | "sessions"; label: string }> = [
  { key: "sessions", label: "Sessions" },
  { key: "vsl_play", label: "VSL Plays" },
  { key: "gate_open", label: "Gate Opens" },
  { key: "calculator_completion", label: "Calculator Completions" },
  { key: "form_submission", label: "Form Submissions" },
  { key: "calendly_outbound_click", label: "Calendly Clicks" },
];

type Period = { start: string; end: string };

/** Current window plus the equally-sized window before it, for period deltas. */
export function comparisonPeriods(range: Period, days: number): { current: Period; previous: Period } {
  const previousEnd = addDays(new Date(`${range.start}T00:00:00Z`), -1);
  const previousStart = addDays(previousEnd, -(days - 1));
  return {
    current: range,
    previous: { start: toDateString(previousStart), end: toDateString(previousEnd) },
  };
}

function percentChange(current: number, previous: number): number | null {
  // A rise from nothing is not a percentage. Callers hide the delta instead
  // of printing +0%, which reads as "unchanged".
  if (previous === 0) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function round(value: number, digits = 1): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Builds a KPI from a daily series. The sparkline is the current period's
 * daily values and the delta compares period totals (or averages, for a rate,
 * where summing percentages would be meaningless).
 */
function toKpi(
  currentDaily: number[],
  previousDaily: number[],
  mode: "total" | "average",
  suffix?: string,
): KPIMetric {
  const current = mode === "total" ? sum(currentDaily) : mean(currentDaily);
  const previous = mode === "total" ? sum(previousDaily) : mean(previousDaily);
  const comparable = previousDaily.length > 0 && previous !== 0;
  return {
    value: round(current, mode === "total" ? 0 : 1),
    change: comparable ? percentChange(current, previous) : null,
    sparkline: currentDaily,
    suffix,
  };
}

export async function buildWebsiteData(
  supabase: ReaderClient,
  args: {
    siteId: string;
    range: Period;
    days: number;
    allTime?: boolean;
    clarityProjectId: string | null;
    domain: string;
    hasSearchConsole: boolean;
  },
): Promise<WebsiteData> {
  const current = args.range;
  const previous = args.allTime
    ? {
        start: current.start,
        end: toDateString(addDays(new Date(`${current.start}T00:00:00Z`), -1)),
      }
    : comparisonPeriods(args.range, args.days).previous;
  const fullStart = args.allTime ? current.start : previous.start;
  const fullEnd = current.end;

  const inCurrent = (date: string) => date >= current.start && date <= current.end;

  // One query per table across both periods, split in memory afterwards.
  const [daily, pages, sources, countries, keyEvents, clarityPages] =
    await Promise.all([
    supabase
      .from("ga4_daily")
      .select("date, sessions, bounce_rate")
      .eq("site_id", args.siteId)
      .gte("date", fullStart)
      .lte("date", fullEnd)
      .order("date"),
    supabase
      .from("ga4_page_daily")
      .select("date, page_path, sessions")
      .eq("site_id", args.siteId)
      .gte("date", current.start)
      .lte("date", current.end),
    supabase
      .from("ga4_source_daily")
      .select("date, source, sessions")
      .eq("site_id", args.siteId)
      .gte("date", current.start)
      .lte("date", current.end),
    supabase
      .from("ga4_country_daily")
      .select("date, country_code, country_name, sessions")
      .eq("site_id", args.siteId)
      .gte("date", fullStart)
      .lte("date", fullEnd),
    supabase
      .from("ga4_key_events_daily")
      .select("date, event_key, count")
      .eq("site_id", args.siteId)
      .gte("date", current.start)
      .lte("date", current.end),
    args.clarityProjectId
      ? supabase
          .from("clarity_page_daily")
          .select("*")
          .eq("clarity_project_id", args.clarityProjectId)
          .eq("site_id", args.siteId)
          .gte("date", fullStart)
          .lte("date", fullEnd)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const firstError =
    daily.error ??
    pages.error ??
    sources.error ??
    countries.error ??
    keyEvents.error ??
    clarityPages.error;
  if (firstError) throw new Error(firstError.message);

  // ---- Sessions ----------------------------------------------------------
  const dailyRows = daily.data ?? [];
  const sessionsCurrent = dailyRows.filter((r) => inCurrent(r.date));
  const sessionsPrevious = dailyRows.filter((r) => !inCurrent(r.date));

  // ---- Clarity behavioral KPIs -------------------------------------------
  // Sourced from this site's own pages, so the numbers describe the selected
  // site rather than the whole shared Clarity project. Rates are weighted by
  // sessions; a flat mean would let a one-session page outvote the homepage.
  const clarityPageRows = (clarityPages.data ?? []) as ClarityPageDaily[];

  const clarityRate = (pick: (row: ClarityPageDaily) => number | null) => {
    const weighted = (rows: ClarityPageDaily[]) => {
      const byDate = new Map<string, ClarityPageDaily[]>();
      for (const row of rows) {
        const bucket = byDate.get(row.date);
        if (bucket) bucket.push(row);
        else byDate.set(row.date, [row]);
      }
      // One value per day so the sparkline stays a time series.
      return [...byDate.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([, dayRows]) => {
          let weight = 0;
          let total = 0;
          for (const row of dayRows) {
            const value = pick(row);
            if (value === null || row.sessions <= 0) continue;
            weight += row.sessions;
            total += value * row.sessions;
          }
          return weight > 0 ? total / weight : null;
        })
        .filter((value): value is number => value !== null);
    };

    return toKpi(
      weighted(clarityPageRows.filter((r) => inCurrent(r.date))),
      weighted(clarityPageRows.filter((r) => !inCurrent(r.date))),
      "average",
      "%",
    );
  };

  /** Newest Clarity row per page, for the scroll depth shown in Top Pages. */
  const clarityByPath = new Map<string, ClarityPageDaily>();
  for (const row of clarityPageRows) {
    if (!inCurrent(row.date)) continue;
    const existing = clarityByPath.get(row.page_path);
    if (!existing || row.date > existing.date) clarityByPath.set(row.page_path, row);
  }

  // ---- Traffic sources ---------------------------------------------------
  const sourceTotals = new Map<string, number>();
  for (const row of sources.data ?? []) {
    sourceTotals.set(row.source, (sourceTotals.get(row.source) ?? 0) + row.sessions);
  }
  const rankedSources = [...sourceTotals.entries()].sort((a, b) => b[1] - a[1]);
  const trafficSources = rankedSources.slice(0, TOP_SOURCES).map(([name, value]) => ({ name, value }));
  const otherSessions = sum(rankedSources.slice(TOP_SOURCES).map(([, value]) => value));
  if (otherSessions > 0) trafficSources.push({ name: "Other", value: otherSessions });

  // ---- Top pages ---------------------------------------------------------
  const pageTotals = new Map<string, number>();
  for (const row of pages.data ?? []) {
    pageTotals.set(row.page_path, (pageTotals.get(row.page_path) ?? 0) + row.sessions);
  }
  // GA4 supplies sessions per page; Clarity supplies that page's scroll depth.
  // exitRate stays undefined -- GA4 has no exit-rate metric and Clarity does
  // not report one, so the kit hides that column.
  const topPages: TopPage[] = [...pageTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_PAGES)
    .map(([url, sessions]) => {
      const scroll = clarityByPath.get(url)?.scroll_depth_pct;
      return {
        url,
        sessions,
        scrollDepth: scroll === null || scroll === undefined ? undefined : Math.round(scroll),
      };
    });

  // With GA4 unconfigured there are no page rows, but Clarity still knows the
  // site's busiest pages, so fall back to those rather than showing nothing.
  if (topPages.length === 0) {
    const byPath = [...clarityByPath.values()].sort((a, b) => b.sessions - a.sessions);
    topPages.push(
      ...byPath.slice(0, TOP_PAGES).map((row) => ({
        url: row.page_path,
        sessions: row.sessions,
        scrollDepth:
          row.scroll_depth_pct === null ? undefined : Math.round(row.scroll_depth_pct),
      })),
    );
  }

  // ---- Countries for the globe -------------------------------------------
  const countryTotals = new Map<
    string,
    { name: string; currentSessions: number; previousSessions: number }
  >();
  for (const row of countries.data ?? []) {
    const entry =
      countryTotals.get(row.country_code) ??
      { name: row.country_name, currentSessions: 0, previousSessions: 0 };
    if (inCurrent(row.date)) entry.currentSessions += row.sessions;
    else entry.previousSessions += row.sessions;
    countryTotals.set(row.country_code, entry);
  }

  const visitorCountries: CountryRow[] = [...countryTotals.entries()]
    .flatMap(([code, entry]) => {
      const centroid = countryCentroid(code);
      // No centroid means the globe has nowhere to plot it, so drop it rather
      // than stack markers at [0, 0] in the Atlantic.
      if (!centroid || entry.currentSessions === 0) return [];
      return [
        {
          code,
          name: entry.name,
          flag: flagEmoji(code),
          traffic: entry.currentSessions,
          trafficChange: percentChange(entry.currentSessions, entry.previousSessions),
          lat: centroid[0],
          lon: centroid[1],
        },
      ];
    })
    .sort((a, b) => b.traffic - a.traffic)
    .slice(0, TOP_COUNTRIES);

  // ---- Conversion funnel -------------------------------------------------
  const eventTotals = new Map<string, number>();
  for (const row of keyEvents.data ?? []) {
    eventTotals.set(row.event_key, (eventTotals.get(row.event_key) ?? 0) + row.count);
  }
  const totalSessions = sum(sessionsCurrent.map((r) => r.sessions));

  const funnelSteps: FunnelStep[] = FUNNEL_ORDER.map((step, index, all) => {
    const sessions =
      step.key === "sessions" ? totalSessions : (eventTotals.get(step.key) ?? 0);
    const previousStepKey = index > 0 ? all[index - 1].key : null;
    const previousCount =
      previousStepKey === null
        ? 0
        : previousStepKey === "sessions"
          ? totalSessions
          : (eventTotals.get(previousStepKey) ?? 0);
    return {
      label: step.label,
      sessions,
      dropoffPct:
        previousStepKey === null || previousCount === 0
          ? 0
          : round(((previousCount - sessions) / previousCount) * 100, 0),
    };
  });

  // GA4 is the authority for traffic volume. When it has no rows at all (not
  // yet connected), fall back to Clarity's session counts so the view is not
  // blank -- and say so, because the two tools count sessions differently.
  const ga4HasTraffic = dailyRows.length > 0;

  const clarityDailySessions = (rows: ClarityPageDaily[]) => {
    const byDate = new Map<string, number>();
    for (const row of rows) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.sessions);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  };

  const clarityCurrent = clarityDailySessions(clarityPageRows.filter((r) => inCurrent(r.date)));
  const clarityPrevious = clarityDailySessions(clarityPageRows.filter((r) => !inCurrent(r.date)));

  const rage = clarityRate((r) => r.rage_click_pct);
  const dead = clarityRate((r) => r.dead_click_pct);
  const quick = clarityRate((r) => r.quick_back_pct);
  const scroll = clarityRate((r) => r.scroll_depth_pct);
  const jsErrors = clarityRate((r) => r.script_error_pct);

  const bounceWeight = sessionsCurrent.reduce((sum, row) => sum + row.sessions, 0);
  const bounceRate =
    bounceWeight > 0
      ? sessionsCurrent.reduce(
          (sum, row) => sum + (row.bounce_rate ?? 0) * row.sessions,
          0,
        ) / bounceWeight
      : null;

  const sessionKpi = ga4HasTraffic
    ? toKpi(
        sessionsCurrent.map((r) => r.sessions),
        sessionsPrevious.map((r) => r.sessions),
        "total",
      )
    : toKpi(
        clarityCurrent.map(([, value]) => value),
        clarityPrevious.map(([, value]) => value),
        "total",
      );

  const displayedKpis = [
    sessionKpi,
    ...(rage.sparkline.length > 0 ? [rage] : []),
    ...(dead.sparkline.length > 0 ? [dead] : []),
    ...(quick.sparkline.length > 0 ? [quick] : []),
    ...(scroll.sparkline.length > 0 ? [scroll] : []),
    ...(jsErrors.sparkline.length > 0 ? [jsErrors] : []),
  ];
  // Period comparison is all or nothing. One tile at +0% beside a real delta
  // is how a missing previous window used to masquerade as "unchanged".
  const comparisons =
    !args.allTime && displayedKpis.every((kpi) => kpi.change !== null);
  if (!comparisons) {
    for (const kpi of displayedKpis) kpi.change = null;
  }

  const countrySessions = [...countryTotals.values()].reduce(
    (total, entry) => total + entry.currentSessions,
    0,
  );
  const shownPageSessions = topPages.reduce((total, page) => total + page.sessions, 0);
  const sourceSessions = rankedSources.reduce((total, [, value]) => total + value, 0);
  const pagesCoverageNote =
    totalSessions > 0 && shownPageSessions !== totalSessions
      ? `Top ${topPages.length} pages cover ${shownPageSessions.toLocaleString("en-US")} of ${totalSessions.toLocaleString("en-US")} sessions in this range. Not a full breakdown.`
      : undefined;
  const sourcesCoverageNote =
    totalSessions > 0 && sourceSessions !== totalSessions
      ? `Source rows cover ${sourceSessions.toLocaleString("en-US")} of ${totalSessions.toLocaleString("en-US")} sessions in this range. Not a full breakdown.`
      : undefined;
  const marketsCoverageNote =
    totalSessions > 0 && countrySessions !== totalSessions
      ? `Country rows cover ${countrySessions.toLocaleString("en-US")} of ${totalSessions.toLocaleString("en-US")} sessions. The share is of sessions with a country, not of all traffic.`
      : undefined;

  if (!comparisons) {
    for (const country of visitorCountries) country.trafficChange = null;
  }

  return {
    sessions: sessionKpi,
    sessionsNote: ga4HasTraffic
      ? undefined
      : "Counted by Microsoft Clarity, not GA4, because no GA4 property is connected for this site yet.",
    rageclickRate: rage.sparkline.length > 0 ? rage : undefined,
    deadclickRate: dead.sparkline.length > 0 ? dead : undefined,
    quickBackRate: quick.sparkline.length > 0 ? quick : undefined,
    scrollDepth: scroll.sparkline.length > 0 ? scroll : undefined,
    jsErrors: jsErrors.sparkline.length > 0 ? jsErrors : undefined,
    visitorTrend: ga4HasTraffic
      ? sessionsCurrent.map((row) => ({ date: row.date, value: row.sessions }))
      : clarityCurrent.map(([date, value]) => ({ date, value })),
    trafficSources,
    visitorCountries,
    topPages,
    funnelSteps,
    signals: [],
    comparisons,
    countrySessions,
    pagesCoverageNote,
    sourcesCoverageNote,
    marketsCoverageNote,
    tldr: overviewTldr({
      domain: args.domain,
      sessions: sessionKpi.value,
      sessionChange: comparisons ? sessionKpi.change : null,
      bounceRate: ga4HasTraffic ? bounceRate : null,
      topPage: topPages[0]?.url ?? null,
      topSource: trafficSources[0]?.name ?? null,
      topCountry: visitorCountries[0]?.name ?? null,
      rageClickPct: rage.sparkline.length > 0 ? rage.value : null,
      searchConsoleConnected: args.hasSearchConsole,
    }),
    behaviorScopeNote: !args.clarityProjectId
      ? "No Clarity project is configured for this site."
      : clarityPageRows.length === 0
        ? "No Clarity pages have been matched to this site's domain yet."
        : "Session-weighted across this site's own pages.",
  };
}
