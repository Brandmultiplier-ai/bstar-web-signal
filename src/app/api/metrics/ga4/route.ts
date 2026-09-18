import { NextResponse } from "next/server";

import { GA4_KEY_EVENTS } from "@/lib/sources";
import { parseRange, readFreshness, requireReader, requireSiteId } from "@/lib/read/request";
import type { Ga4EventKey } from "@/lib/database.types";

export const dynamic = "force-dynamic";

const TOP_N = 12;

/** Reads stored GA4 data only. Never touches the GA4 API. */
export async function GET(request: Request) {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const siteId = requireSiteId(url);
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const range = parseRange(url);
  const { supabase } = auth;

  const [daily, pages, sources, keyEvents, devices, channels, countries, landings, os, freshness] =
    await Promise.all([
      supabase
        .from("ga4_daily")
        .select(
          "date, sessions, users, pageviews, new_users, engaged_sessions, bounce_rate, avg_session_duration",
        )
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end)
        .order("date"),
      supabase
        .from("ga4_page_daily")
        .select("page_path, pageviews, sessions, users, engaged_sessions, bounce_rate, avg_session_duration")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      supabase
        .from("ga4_source_daily")
        .select("source, medium, sessions, users")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      supabase
        .from("ga4_key_events_daily")
        .select("event_key, page_path, placement, count")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      supabase
        .from("ga4_device_daily")
        .select("device, sessions")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      supabase
        .from("ga4_channel_daily")
        .select("channel, sessions")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      supabase
        .from("ga4_country_daily")
        .select("country_name, sessions")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      supabase
        .from("ga4_landing_daily")
        .select("page_path, sessions, users, bounce_rate, avg_session_duration, engaged_sessions")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      supabase
        .from("ga4_os_daily")
        .select("os, sessions")
        .eq("site_id", siteId)
        .gte("date", range.start)
        .lte("date", range.end),
      readFreshness(supabase, "ga4"),
    ]);

  const error =
    daily.error ??
    pages.error ??
    sources.error ??
    keyEvents.error ??
    devices.error ??
    channels.error ??
    countries.error ??
    (missingRelation(landings.error) ? null : landings.error) ??
    (missingRelation(os.error) ? null : os.error);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const seriesRows = daily.data ?? [];
  const sessions = sum(seriesRows, (row) => row.sessions);
  const users = sum(seriesRows, (row) => row.users);
  const pageviews = sum(seriesRows, (row) => row.pageviews);
  const newUsers = sum(seriesRows, (row) => row.new_users ?? 0);
  const engaged = sum(seriesRows, (row) => row.engaged_sessions ?? 0);

  const topPages = rank(
    pages.data ?? [],
    (row) => row.page_path,
    (row) => row.pageviews,
    (a, b) => ({
      ...a,
      pageviews: a.pageviews + b.pageviews,
      sessions: a.sessions + b.sessions,
      users: (a.users ?? 0) + (b.users ?? 0),
      engaged_sessions: (a.engaged_sessions ?? 0) + (b.engaged_sessions ?? 0),
      bounce_rate: weighted(a.bounce_rate, a.sessions, b.bounce_rate, b.sessions),
      avg_session_duration: weighted(
        a.avg_session_duration,
        a.sessions,
        b.avg_session_duration,
        b.sessions,
      ),
    }),
  ).map((row) => ({
    ...row,
    bounceRate: row.bounce_rate,
    avgSessionDuration: row.avg_session_duration,
    engagementRate:
      row.sessions > 0 ? (row.engaged_sessions ?? 0) / row.sessions : null,
  }));

  const landingPages = rank(
    landings.data ?? [],
    (row) => row.page_path,
    (row) => row.sessions,
    (a, b) => ({
      ...a,
      sessions: a.sessions + b.sessions,
      users: a.users + b.users,
      engaged_sessions: a.engaged_sessions + b.engaged_sessions,
      bounce_rate: weighted(a.bounce_rate, a.sessions, b.bounce_rate, b.sessions),
      avg_session_duration: weighted(
        a.avg_session_duration,
        a.sessions,
        b.avg_session_duration,
        b.sessions,
      ),
    }),
  ).map((row) => ({
    ...row,
    bounceRate: row.bounce_rate,
    avgSessionDuration: row.avg_session_duration,
    engagementRate: row.sessions > 0 ? row.engaged_sessions / row.sessions : null,
  }));

  const topSources = rank(
    sources.data ?? [],
    (row) => `${row.source} / ${row.medium}`,
    (row) => row.sessions,
    (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
  );

  const events = (Object.keys(GA4_KEY_EVENTS) as Ga4EventKey[]).map((key) => {
    const rows = (keyEvents.data ?? []).filter((row) => row.event_key === key);
    return {
      eventKey: key,
      label: GA4_KEY_EVENTS[key].label,
      total: rows.reduce((total, row) => total + row.count, 0),
      byPlacement: rank(
        rows,
        (row) => `${row.placement} — ${row.page_path}`,
        (row) => row.count,
        (a, b) => ({ ...a, count: a.count + b.count }),
      ),
    };
  });

  return NextResponse.json({
    range,
    freshness,
    totals: {
      sessions,
      users,
      pageviews,
      newUsers,
      engagedSessions: engaged,
      engagementRate: sessions > 0 ? engaged / sessions : null,
      bounceRate: weightedMean(
        seriesRows.map((row) => ({ value: row.bounce_rate, weight: row.sessions })),
      ),
      avgSessionDuration: weightedMean(
        seriesRows.map((row) => ({ value: row.avg_session_duration, weight: row.sessions })),
      ),
      pagesPerSession: sessions > 0 ? pageviews / sessions : null,
    },
    series: seriesRows.map((row) => ({
      date: row.date,
      sessions: row.sessions,
      users: row.users,
      pageviews: row.pageviews,
      newUsers: row.new_users ?? 0,
      returningUsers: Math.max(0, (row.users ?? 0) - (row.new_users ?? 0)),
      bounceRate: row.bounce_rate,
      engagedSessions: row.engaged_sessions ?? 0,
    })),
    devices: collapse((devices.data ?? []).map((row) => ({ name: row.device, value: row.sessions }))),
    channels: collapse(
      (channels.data ?? []).map((row) => ({ name: row.channel, value: row.sessions })),
    ),
    countries: collapse(
      (countries.data ?? []).map((row) => ({ name: row.country_name, value: row.sessions })),
    ),
    operatingSystems: collapse(
      (os.data ?? []).map((row) => ({ name: row.os, value: row.sessions })),
    ),
    topPages,
    landingPages: landingPages.filter((row) => row.page_path !== "(not set)"),
    topSources,
    keyEvents: events,
  });
}

function sum<T>(rows: T[], value: (row: T) => number): number {
  return rows.reduce((total, row) => total + value(row), 0);
}

/** PostgREST can 404 a brand-new table until its schema cache reloads. */
function missingRelation(error: { message: string } | null): boolean {
  return Boolean(error && /could not find the table|schema cache/i.test(error.message));
}

function weighted(
  a: number | null,
  aWeight: number,
  b: number | null,
  bWeight: number,
): number | null {
  if (a === null && b === null) return null;
  const weight = aWeight + bWeight;
  if (weight <= 0) return a ?? b;
  return ((a ?? 0) * aWeight + (b ?? 0) * bWeight) / weight;
}

function weightedMean(rows: Array<{ value: number | null; weight: number }>): number | null {
  let weight = 0;
  let total = 0;
  for (const row of rows) {
    if (row.value === null) continue;
    const w = row.weight > 0 ? row.weight : 1;
    weight += w;
    total += row.value * w;
  }
  return weight > 0 ? total / weight : null;
}

function collapse(rows: Array<{ name: string; value: number }>): Array<{ name: string; value: number }> {
  const byName = new Map<string, number>();
  for (const row of rows) {
    byName.set(row.name, (byName.get(row.name) ?? 0) + row.value);
  }
  return [...byName.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, TOP_N);
}

function rank<T>(
  rows: T[],
  keyOf: (row: T) => string,
  weight: (row: T) => number,
  merge: (a: T, b: T) => T,
): Array<T & { key: string }> {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = byKey.get(key);
    byKey.set(key, existing ? merge(existing, row) : row);
  }
  return [...byKey.entries()]
    .map(([key, row]) => ({ ...row, key }))
    .sort((a, b) => weight(b) - weight(a))
    .slice(0, TOP_N);
}
