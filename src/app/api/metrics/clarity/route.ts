import { NextResponse } from "next/server";

import { parseRange, readFreshness, requireReader } from "@/lib/read/request";

export const dynamic = "force-dynamic";

/**
 * Reads stored Clarity data only. Date changes never call Microsoft.
 *
 * Pages are stored with host, so the shared project is split per site in this
 * response even though the upstream API is one project.
 */
export async function GET(request: Request) {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const range = parseRange(url);
  const siteId = url.searchParams.get("siteId");
  const { supabase } = auth;

  const [daily, pages, breakdowns, sites, freshness] = await Promise.all([
    supabase
      .from("clarity_daily")
      .select("*")
      .gte("date", range.start)
      .lte("date", range.end)
      .order("date"),
    (() => {
      let query = supabase
        .from("clarity_page_daily")
        .select(
          "host, page_path, site_id, sessions, distinct_users, scroll_depth_pct, active_time_seconds, total_time_seconds, rage_click_pct, dead_click_pct, quick_back_pct, script_error_pct, excessive_scroll_pct",
        )
        .gte("date", range.start)
        .lte("date", range.end);
      if (siteId) query = query.eq("site_id", siteId);
      return query;
    })(),
    supabase
      .from("clarity_breakdown_daily")
      .select("dimension, key, sessions")
      .gte("date", range.start)
      .lte("date", range.end),
    supabase
      .from("sites")
      .select("domain, clarity_project_id")
      .not("clarity_project_id", "is", null)
      .eq("is_active", true),
    readFreshness(supabase, "clarity"),
  ]);

  const error = daily.error ?? pages.error ?? breakdowns.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const series = (daily.data ?? []).map((row) => ({
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
    .slice(0, 25);

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

  return NextResponse.json({
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
  });
}
