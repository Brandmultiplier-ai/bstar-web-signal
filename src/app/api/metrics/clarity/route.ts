import { NextResponse } from "next/server";

import { parseRange, readFreshness, requireReader } from "@/lib/read/request";
import { readJson, startTimer } from "@/lib/read/respond";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

const TOP_PAGES = 60;

/** Stored key for the shared project. It is real data, not a missing id. */
const SHARED_CLARITY_PROJECT = "CLARITY_SHARED_PROJECT_ID";

/**
 * Reads stored Clarity data only. Date changes never call Microsoft.
 *
 * Daily totals and breakdowns follow the selected site's `clarity_project_id`,
 * the same key the Overview uses. `CLARITY_SHARED_PROJECT_ID` still matches
 * when that is the site's id. Page rows are limited to the site, and a site
 * whose own project id differs still keeps page history stored under the
 * shared id. Those pages fill the daily series only when this project has
 * no daily rows, so another project's days are not shown.
 */
export async function GET(request: Request) {
  const timer = startTimer();
  const auth = await requireReader();
  if (!auth.ok) return auth.response;
  timer.mark("auth");

  const url = new URL(request.url);
  const range = parseRange(url);
  const siteId = url.searchParams.get("siteId");
  const { supabase } = auth;

  let projectId: string | null = null;
  if (siteId) {
    const site = await supabase
      .from("sites")
      .select("clarity_project_id")
      .eq("id", siteId)
      .maybeSingle();
    if (site.error) return NextResponse.json({ error: site.error.message }, { status: 500 });
    projectId = site.data?.clarity_project_id ?? null;
  }

  const [daily, pages, breakdowns, sites, freshness] = await Promise.all([
    (() => {
      let query = supabase
        .from("clarity_daily")
        .select(
          "date, sessions, unique_users, rage_click_pct, dead_click_pct, excessive_scroll_pct, quick_back_pct, scroll_depth_pct, active_time_seconds, script_error_pct",
        )
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date");
      if (siteId) query = query.eq("clarity_project_id", projectId ?? "");
      return query;
    })(),
    (() => {
      let query = supabase
        .from("clarity_page_daily")
        .select(
          "date, host, page_path, site_id, sessions, distinct_users, scroll_depth_pct, active_time_seconds, total_time_seconds, rage_click_pct, dead_click_pct, quick_back_pct, script_error_pct, excessive_scroll_pct",
        )
        .gte("date", range.start)
        .lte("date", range.end);
      if (siteId) {
        query = query.eq("site_id", siteId);
        const projectIds = projectId
          ? projectId === SHARED_CLARITY_PROJECT
            ? [SHARED_CLARITY_PROJECT]
            : [projectId, SHARED_CLARITY_PROJECT]
          : [];
        query =
          projectIds.length === 0
            ? query.eq("clarity_project_id", "")
            : query.in("clarity_project_id", projectIds);
      }
      return query;
    })(),
    (() => {
      let query = supabase
        .from("clarity_breakdown_daily")
        .select("dimension, key, sessions")
        .gte("date", range.start)
        .lte("date", range.end);
      if (siteId) query = query.eq("clarity_project_id", projectId ?? "");
      return query;
    })(),
    supabase
      .from("sites")
      .select("domain, clarity_project_id")
      .not("clarity_project_id", "is", null)
      .eq("is_active", true),
    readFreshness(supabase, "clarity"),
  ]);
  timer.mark("db");

  const error = daily.error ?? pages.error ?? breakdowns.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let series = (daily.data ?? []).map((row) => ({
    date: row.date,
    sessions: row.sessions,
    uniqueUsers: row.unique_users,
    rageClickPct: row.rage_click_pct,
    deadClickPct: row.dead_click_pct,
    excessiveScrollPct: row.excessive_scroll_pct,
    quickBackPct: row.quick_back_pct,
    scrollDepthPct: row.scroll_depth_pct,
    activeTimeSeconds: row.active_time_seconds,
    scriptErrorPct: row.script_error_pct,
  }));

  // This site's project has no daily rows. Use its own stored pages, including
  // history kept under the shared project id, instead of another project's days.
  if (siteId && series.length === 0) {
    series = seriesFromPages(pages.data ?? []);
  }

  const averageOf = (pick: (row: (typeof series)[number]) => number | null) => {
    const values = series.map(pick).filter((value): value is number => value !== null);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  };

  const pageTotals = new Map<
    string,
    {
      host: string;
      pagePath: string;
      sessions: number;
      distinctUsers: number;
      scroll: Array<{ value: number | null; weight: number }>;
      active: Array<{ value: number | null; weight: number }>;
      rage: Array<{ value: number | null; weight: number }>;
      dead: Array<{ value: number | null; weight: number }>;
      quick: Array<{ value: number | null; weight: number }>;
      script: Array<{ value: number | null; weight: number }>;
      excessive: Array<{ value: number | null; weight: number }>;
      totalTime: Array<{ value: number | null; weight: number }>;
    }
  >();

  for (const row of pages.data ?? []) {
    const key = `${row.host}|${row.page_path}`;
    const existing = pageTotals.get(key) ?? {
      host: row.host,
      pagePath: row.page_path,
      sessions: 0,
      distinctUsers: 0,
      scroll: [],
      active: [],
      rage: [],
      dead: [],
      quick: [],
      script: [],
      excessive: [],
      totalTime: [],
    };
    existing.sessions += row.sessions;
    existing.distinctUsers += row.distinct_users;
    existing.scroll.push({ value: row.scroll_depth_pct, weight: row.sessions });
    existing.active.push({ value: row.active_time_seconds, weight: row.sessions });
    existing.rage.push({ value: row.rage_click_pct, weight: row.sessions });
    existing.dead.push({ value: row.dead_click_pct, weight: row.sessions });
    existing.quick.push({ value: row.quick_back_pct, weight: row.sessions });
    existing.script.push({ value: row.script_error_pct, weight: row.sessions });
    existing.excessive.push({ value: row.excessive_scroll_pct, weight: row.sessions });
    existing.totalTime.push({ value: row.total_time_seconds, weight: row.sessions });
    pageTotals.set(key, existing);
  }

  const mean = (rows: Array<{ value: number | null; weight: number }>) => {
    let weight = 0;
    let total = 0;
    for (const row of rows) {
      if (row.value === null || row.weight <= 0) continue;
      weight += row.weight;
      total += row.value * row.weight;
    }
    return weight > 0 ? total / weight : null;
  };

  const topPages = [...pageTotals.values()]
    .map((row) => ({
      host: row.host,
      pagePath: row.pagePath,
      sessions: row.sessions,
      distinctUsers: row.distinctUsers,
      scrollDepthPct: mean(row.scroll),
      activeTimeSeconds: mean(row.active),
      rageClickPct: mean(row.rage),
      deadClickPct: mean(row.dead),
      quickBackPct: mean(row.quick),
      scriptErrorPct: mean(row.script),
      excessiveScrollPct: mean(row.excessive),
      totalTimeSeconds: mean(row.totalTime),
    }))
    .filter((row) => row.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, TOP_PAGES);

  const pie = (dimension: string) => {
    const byKey = new Map<string, number>();
    for (const row of breakdowns.data ?? []) {
      if (row.dimension !== dimension) continue;
      byKey.set(row.key, (byKey.get(row.key) ?? 0) + row.sessions);
    }
    return [...byKey.entries()]
      .map(([name, value]) => ({ name, value }))
      .filter((row) => row.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  };

  const byHostMap = new Map<string, number>();
  for (const row of pages.data ?? []) {
    byHostMap.set(row.host, (byHostMap.get(row.host) ?? 0) + row.sessions);
  }

  return readJson({
    range,
    freshness,
    coveredDomains: (sites.data ?? []).map((site) => site.domain),
    totals: {
      sessions: series.reduce((sum, row) => sum + row.sessions, 0),
      uniqueUsers: series.reduce((sum, row) => sum + row.uniqueUsers, 0),
      rageClickPct: averageOf((row) => row.rageClickPct),
      deadClickPct: averageOf((row) => row.deadClickPct),
      excessiveScrollPct: averageOf((row) => row.excessiveScrollPct),
      quickBackPct: averageOf((row) => row.quickBackPct),
      scrollDepthPct: averageOf((row) => row.scrollDepthPct),
      activeTimeSeconds: averageOf((row) => row.activeTimeSeconds),
      scriptErrorPct: averageOf((row) => row.scriptErrorPct),
      daysWithRates: series.filter((row) => row.rageClickPct !== null).length,
      daysTotal: series.length,
    },
    series,
    devices: pie("device"),
    browsers: pie("browser"),
    sources: pie("source"),
    countries: pie("country"),
    operatingSystems: pie("os"),
    byHost: [...byHostMap.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    topPages,
  }, timer);
}

type PageDay = {
  date: string;
  sessions: number;
  distinct_users: number;
  rage_click_pct: number | null;
  dead_click_pct: number | null;
  excessive_scroll_pct: number | null;
  quick_back_pct: number | null;
  scroll_depth_pct: number | null;
  active_time_seconds: number | null;
  script_error_pct: number | null;
};

/** Site-scoped days from stored pages. Rates are session-weighted within the day. */
function seriesFromPages(rows: PageDay[]) {
  const byDate = new Map<
    string,
    {
      sessions: number;
      users: number;
      rage: number;
      rageW: number;
      dead: number;
      deadW: number;
      excessive: number;
      excessiveW: number;
      quick: number;
      quickW: number;
      scroll: number;
      scrollW: number;
      active: number;
      activeW: number;
      script: number;
      scriptW: number;
    }
  >();

  for (const row of rows) {
    const bucket = byDate.get(row.date) ?? {
      sessions: 0,
      users: 0,
      rage: 0,
      rageW: 0,
      dead: 0,
      deadW: 0,
      excessive: 0,
      excessiveW: 0,
      quick: 0,
      quickW: 0,
      scroll: 0,
      scrollW: 0,
      active: 0,
      activeW: 0,
      script: 0,
      scriptW: 0,
    };
    bucket.sessions += row.sessions;
    bucket.users += row.distinct_users;
    const weight = row.sessions;
    const add = (value: number | null, sum: number, seen: number): [number, number] =>
      value === null || weight <= 0 ? [sum, seen] : [sum + value * weight, seen + weight];
    [bucket.rage, bucket.rageW] = add(row.rage_click_pct, bucket.rage, bucket.rageW);
    [bucket.dead, bucket.deadW] = add(row.dead_click_pct, bucket.dead, bucket.deadW);
    [bucket.excessive, bucket.excessiveW] = add(
      row.excessive_scroll_pct,
      bucket.excessive,
      bucket.excessiveW,
    );
    [bucket.quick, bucket.quickW] = add(row.quick_back_pct, bucket.quick, bucket.quickW);
    [bucket.scroll, bucket.scrollW] = add(row.scroll_depth_pct, bucket.scroll, bucket.scrollW);
    [bucket.active, bucket.activeW] = add(
      row.active_time_seconds,
      bucket.active,
      bucket.activeW,
    );
    [bucket.script, bucket.scriptW] = add(row.script_error_pct, bucket.script, bucket.scriptW);
    byDate.set(row.date, bucket);
  }

  const rate = (sum: number, weight: number) => (weight > 0 ? sum / weight : null);

  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, bucket]) => ({
      date,
      sessions: bucket.sessions,
      uniqueUsers: bucket.users,
      rageClickPct: rate(bucket.rage, bucket.rageW),
      deadClickPct: rate(bucket.dead, bucket.deadW),
      excessiveScrollPct: rate(bucket.excessive, bucket.excessiveW),
      quickBackPct: rate(bucket.quick, bucket.quickW),
      scrollDepthPct: rate(bucket.scroll, bucket.scrollW),
      activeTimeSeconds: rate(bucket.active, bucket.activeW),
      scriptErrorPct: rate(bucket.script, bucket.scriptW),
    }));
}
