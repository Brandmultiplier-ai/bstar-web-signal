import { NextResponse } from "next/server";

import { inCountedRange, isHeadline } from "@/lib/calendly-taxonomy";
import { readClassifiedBookings } from "@/lib/read/calendly";
import { addDays, inclusiveDays, toDateString } from "@/lib/dates";
import { delta, inWindow, movers, previousWindow, sumBy, type Window } from "@/lib/read/compare";
import { buildInsights } from "@/lib/read/insights";
import { readCompanyVisits, readFormCaptures } from "@/lib/read/leads";
import { parseRange, readAllFreshness, requireReader, requireSiteId } from "@/lib/read/request";
import { readJson, startTimer } from "@/lib/read/respond";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

type Section = "ga4" | "gsc" | "clarity" | "calendly" | "leads";

type Kpi = {
  id: string;
  label: string;
  section: Section;
  format: "number" | "percent" | "position";
  /** Whether a rise is good news. Average position and friction rates improve downward. */
  goodWhen: "up" | "down";
} & (
  | { available: true; current: number; previous: number | null; change: number | null }
  | { available: false; reason: string }
);

/**
 * The business summary for one site: one figure per source for the selected
 * range, the same figure for the window just before it, and the pages,
 * queries and channels that moved most. Stored data only.
 */
export async function GET(request: Request) {
  const timer = startTimer();
  const auth = await requireReader();
  if (!auth.ok) return auth.response;
  timer.mark("auth");

  const url = new URL(request.url);
  const siteId = requireSiteId(url);
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const range = parseRange(url);
  const current: Window = { start: range.start, end: range.end };
  const previous = range.allTime ? null : previousWindow(current);
  const span: Window = { start: previous?.start ?? current.start, end: current.end };
  const { supabase } = auth;

  const site = await supabase
    .from("sites")
    .select("domain, ga4_property_id, gsc_site_url, clarity_project_id")
    .eq("id", siteId)
    .maybeSingle();
  if (site.error) return NextResponse.json({ error: site.error.message }, { status: 500 });
  if (!site.data) return NextResponse.json({ error: "Unknown siteId" }, { status: 404 });
  const { domain, ga4_property_id, gsc_site_url, clarity_project_id } = site.data;

  const [ga4Daily, ga4Pages, ga4Channels, gscDaily, gscQueries, clarityDaily, bookings, visits, forms, freshness] =
    await Promise.all([
      supabase
        .from("ga4_daily")
        .select("date, sessions, users")
        .eq("site_id", siteId)
        .gte("date", span.start)
        .lte("date", span.end),
      supabase
        .from("ga4_page_daily")
        .select("date, page_path, pageviews")
        .eq("site_id", siteId)
        .gte("date", span.start)
        .lte("date", span.end),
      supabase
        .from("ga4_channel_daily")
        .select("date, channel, sessions")
        .eq("site_id", siteId)
        .gte("date", span.start)
        .lte("date", span.end),
      supabase
        .from("gsc_daily")
        .select("date, clicks, impressions, avg_position")
        .eq("site_id", siteId)
        .gte("date", span.start)
        .lte("date", span.end),
      supabase
        .from("gsc_query_daily")
        .select("date, query, clicks")
        .eq("site_id", siteId)
        .gte("date", span.start)
        .lte("date", span.end),
      supabase
        .from("clarity_daily")
        .select("date, sessions, rage_click_pct, dead_click_pct")
        .eq("clarity_project_id", clarity_project_id ?? "")
        .gte("date", span.start)
        .lte("date", span.end),
      readClassifiedBookings(supabase),
      readCompanyVisits(supabase, siteId, span.start, span.end),
      readFormCaptures(supabase, domain, span.start, span.end),
      readAllFreshness(supabase),
    ]);
  timer.mark("db");

  const split = <T extends { date: string }>(rows: T[] | null) => ({
    now: (rows ?? []).filter((row) => inWindow(row.date, current)),
    before: previous ? (rows ?? []).filter((row) => inWindow(row.date, previous)) : [],
  });

  const numberKpi = (
    base: Omit<Kpi, "available" | "current" | "previous" | "change" | "reason">,
    read: { error: { message: string } | null } | null,
    configured: boolean,
    pulledEver: boolean,
    now: number | null,
    before: number | null,
  ): Kpi => {
    if (!configured) return { ...base, available: false, reason: "Not connected for this site." };
    if (read?.error) return { ...base, available: false, reason: `Read failed: ${read.error.message}` };
    if (!pulledEver) return { ...base, available: false, reason: "No pull yet for this source." };
    if (now === null) return { ...base, available: false, reason: "No stored days in this range." };
    const d = delta(now, previous ? before : null);
    return { ...base, available: true, current: now, previous: d.previous, change: d.change };
  };

  const total = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((sum, row) => sum + pick(row), 0);
  const weighted = <T>(rows: T[], value: (row: T) => number | null, weight: (row: T) => number) => {
    let w = 0;
    let s = 0;
    for (const row of rows) {
      const v = value(row);
      if (v === null || weight(row) <= 0) continue;
      w += weight(row);
      s += v * weight(row);
    }
    return w > 0 ? s / w : null;
  };
  const ratePct = (part: number, whole: number) => (whole > 0 ? (part / whole) * 100 : null);

  const ga4 = split(ga4Daily.data);
  const gsc = split(gscDaily.data);
  const clarity = split(clarityDaily.data);
  const hasGa4 = ga4_property_id !== null;
  const hasGsc = gsc_site_url !== null;
  const hasClarity = clarity_project_id !== null;

  const bare = domain.replace(/^www\./, "");
  const primary = bookings.rows.filter(
    (row) => isHeadline(row) && row.conversionClass === "primary" && row.property === bare,
  );
  const bookingsMapToSite = bookings.rows.some((row) => row.property === bare);
  const countIn = (window: Window) =>
    primary.filter((row) => inCountedRange(row, window.start, window.end)).length;

  const companiesIn = (window: Window) =>
    visits.available
      ? new Set(
          visits.rows
            .filter((row) => row.company && inWindow(row.captured_at, window))
            .map((row) => row.company!.trim()),
        ).size
      : 0;
  const formsIn = (window: Window) =>
    forms.available
      ? forms.rows.filter((row) => inWindow(row.submitted_at ?? row.received_at, window)).length
      : 0;

  const kpis: Kpi[] = [
    numberKpi(
      { id: "sessions", label: "Website visits", section: "ga4", format: "number", goodWhen: "up" },
      ga4Daily,
      hasGa4,
      Boolean(freshness.ga4.lastSuccessAt),
      ga4.now.length ? total(ga4.now, (row) => row.sessions) : null,
      ga4.before.length ? total(ga4.before, (row) => row.sessions) : null,
    ),
    numberKpi(
      { id: "users", label: "Visitors", section: "ga4", format: "number", goodWhen: "up" },
      ga4Daily,
      hasGa4,
      Boolean(freshness.ga4.lastSuccessAt),
      ga4.now.length ? total(ga4.now, (row) => row.users) : null,
      ga4.before.length ? total(ga4.before, (row) => row.users) : null,
    ),
    numberKpi(
      { id: "clicks", label: "Google search clicks", section: "gsc", format: "number", goodWhen: "up" },
      gscDaily,
      hasGsc,
      Boolean(freshness.gsc.lastSuccessAt),
      gsc.now.length ? total(gsc.now, (row) => row.clicks) : null,
      gsc.before.length ? total(gsc.before, (row) => row.clicks) : null,
    ),
    numberKpi(
      { id: "position", label: "Average Google rank", section: "gsc", format: "position", goodWhen: "down" },
      gscDaily,
      hasGsc,
      Boolean(freshness.gsc.lastSuccessAt),
      weighted(gsc.now, (row) => row.avg_position, (row) => row.impressions),
      weighted(gsc.before, (row) => row.avg_position, (row) => row.impressions),
    ),
    numberKpi(
      { id: "impressions", label: "Google search impressions", section: "gsc", format: "number", goodWhen: "up" },
      gscDaily,
      hasGsc,
      Boolean(freshness.gsc.lastSuccessAt),
      gsc.now.length ? total(gsc.now, (row) => row.impressions) : null,
      gsc.before.length ? total(gsc.before, (row) => row.impressions) : null,
    ),
    numberKpi(
      { id: "ctr", label: "Search click-through rate", section: "gsc", format: "percent", goodWhen: "up" },
      gscDaily,
      hasGsc,
      Boolean(freshness.gsc.lastSuccessAt),
      ratePct(total(gsc.now, (row) => row.clicks), total(gsc.now, (row) => row.impressions)),
      ratePct(total(gsc.before, (row) => row.clicks), total(gsc.before, (row) => row.impressions)),
    ),
    numberKpi(
      { id: "rage", label: "Rage-click rate", section: "clarity", format: "percent", goodWhen: "down" },
      clarityDaily,
      hasClarity,
      Boolean(freshness.clarity.lastSuccessAt),
      weighted(clarity.now, (row) => row.rage_click_pct, (row) => row.sessions),
      weighted(clarity.before, (row) => row.rage_click_pct, (row) => row.sessions),
    ),
    numberKpi(
      { id: "dead", label: "Dead-click rate", section: "clarity", format: "percent", goodWhen: "down" },
      clarityDaily,
      hasClarity,
      Boolean(freshness.clarity.lastSuccessAt),
      weighted(clarity.now, (row) => row.dead_click_pct, (row) => row.sessions),
      weighted(clarity.before, (row) => row.dead_click_pct, (row) => row.sessions),
    ),
    numberKpi(
      { id: "bookings", label: "Sales calls booked", section: "calendly", format: "number", goodWhen: "up" },
      bookings.error ? { error: { message: bookings.error } } : null,
      bookingsMapToSite,
      Boolean(freshness.calendly.lastSuccessAt),
      countIn(current),
      previous ? countIn(previous) : null,
    ),
    numberKpi(
      { id: "bookingRate", label: "Visit to booking rate", section: "calendly", format: "percent", goodWhen: "up" },
      ga4Daily.error ? ga4Daily : bookings.error ? { error: { message: bookings.error } } : null,
      hasGa4 && bookingsMapToSite,
      Boolean(freshness.ga4.lastSuccessAt && freshness.calendly.lastSuccessAt),
      ga4.now.length ? ratePct(countIn(current), total(ga4.now, (row) => row.sessions)) : null,
      previous && ga4.before.length ? ratePct(countIn(previous), total(ga4.before, (row) => row.sessions)) : null,
    ),
    numberKpi(
      { id: "companies", label: "Companies identified", section: "leads", format: "number", goodWhen: "up" },
      visits.available ? null : { error: { message: visits.reason } },
      true,
      true,
      companiesIn(current),
      previous ? companiesIn(previous) : null,
    ),
    forms.available
      ? numberKpi(
          { id: "forms", label: "Form submissions", section: "leads", format: "number", goodWhen: "up" },
          null,
          true,
          true,
          formsIn(current),
          previous ? formsIn(previous) : null,
        )
      : {
          id: "forms",
          label: "Form submissions",
          section: "leads",
          format: "number",
          goodWhen: "up",
          available: false,
          reason: forms.reason,
        },
  ];

  const pages = split(ga4Pages.data);
  const channels = split(ga4Channels.data);
  const queries = split(gscQueries.data);
  const changed = previous
    ? {
        pages: movers(
          sumBy(pages.now, (row) => row.page_path, (row) => row.pageviews),
          sumBy(pages.before, (row) => row.page_path, (row) => row.pageviews),
        ),
        queries: movers(
          sumBy(queries.now, (row) => row.query.trim().toLowerCase(), (row) => row.clicks),
          sumBy(queries.before, (row) => row.query.trim().toLowerCase(), (row) => row.clicks),
        ),
        channels: movers(
          sumBy(channels.now, (row) => row.channel, (row) => row.sessions),
          sumBy(channels.before, (row) => row.channel, (row) => row.sessions),
        ),
      }
    : null;

  const daily = dailySeries(current, previous, ga4Daily.data ?? [], gscDaily.data ?? []);
  const insights = buildInsights({ kpis, changed, daily: daily.map((point) => point.current) });

  return readJson(
    {
      range,
      previous,
      kpis,
      changed,
      daily,
      insights,
      freshness: {
        ga4: freshness.ga4,
        gsc: freshness.gsc,
        clarity: freshness.clarity,
        calendly: freshness.calendly,
        rb2b: freshness.rb2b,
      },
    },
    timer,
  );
}

type DayRow = { date: string };

/**
 * One point per day of the range, paired with the same day offset in the
 * previous window. A day with no stored row is null, never zero.
 */
function dailySeries(
  current: Window,
  previous: Window | null,
  ga4Rows: Array<DayRow & { sessions: number }>,
  gscRows: Array<DayRow & { clicks: number }>,
) {
  const sessions = sumBy(ga4Rows, (row) => row.date.slice(0, 10), (row) => row.sessions);
  const clicks = sumBy(gscRows, (row) => row.date.slice(0, 10), (row) => row.clicks);
  const stored = [...sessions.keys(), ...clicks.keys()].filter((date) => inWindow(date, current)).sort();
  const first = previous ? current.start : (stored[0] ?? current.start);
  const days = Math.min(inclusiveDays(first, current.end), MAX_DAILY_POINTS);
  const start = new Date(`${current.end}T00:00:00Z`);
  const point = (date: string) => ({
    date,
    sessions: sessions.get(date) ?? null,
    clicks: clicks.get(date) ?? null,
  });

  return Array.from({ length: days }, (_, i) => {
    const date = toDateString(addDays(start, i - days + 1));
    const earlier = previous ? toDateString(addDays(new Date(`${previous.end}T00:00:00Z`), i - days + 1)) : null;
    return { current: point(date), previous: earlier ? point(earlier) : null };
  });
}

const MAX_DAILY_POINTS = 366;
