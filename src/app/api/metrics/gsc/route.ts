import { NextResponse } from "next/server";

import { parseRange, readFreshness, requireReader, requireSiteId } from "@/lib/read/request";

export const dynamic = "force-dynamic";

const TOP_QUERIES = 20;

/** Collapse spacing, case, and invisible characters so one query is one row. */
function normalizeQuery(query: string): string {
  return query
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/** Reads stored Search Console data only. Never touches the GSC API. */
export async function GET(request: Request) {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const siteId = requireSiteId(url);
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });

  const range = parseRange(url);
  const { supabase } = auth;

  const [daily, queries, indexStatus, freshness] = await Promise.all([
    supabase
      .from("gsc_daily")
      .select("date, clicks, impressions, ctr, avg_position")
      .eq("site_id", siteId)
      .gte("date", range.start)
      .lte("date", range.end)
      .order("date"),
    supabase
      .from("gsc_query_daily")
      .select("query, clicks, impressions, ctr, avg_position")
      .eq("site_id", siteId)
      .gte("date", range.start)
      .lte("date", range.end),
    // Coverage is a snapshot rather than a series, so take the newest one we
    // have rather than filtering it to the selected range.
    supabase
      .from("gsc_index_status")
      .select("date, indexed_count, not_indexed_count")
      .eq("site_id", siteId)
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    readFreshness(supabase, "gsc"),
  ]);

  const error = daily.error ?? queries.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const series = daily.data ?? [];
  const clicks = series.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = series.reduce((sum, row) => sum + row.impressions, 0);

  // CTR and average position are ratios, so they are recomputed over the
  // period rather than averaged across days, which would weight a quiet day
  // the same as a busy one.
  const weightedPosition =
    impressions > 0
      ? series.reduce((sum, row) => sum + row.avg_position * row.impressions, 0) / impressions
      : 0;

  const byQuery = new Map<
    string,
    { query: string; clicks: number; impressions: number; positionWeight: number }
  >();
  for (const row of queries.data ?? []) {
    const key = normalizeQuery(row.query);
    if (!key) continue;
    const existing = byQuery.get(key);
    if (existing) {
      existing.clicks += row.clicks;
      existing.impressions += row.impressions;
      existing.positionWeight += row.avg_position * row.impressions;
    } else {
      byQuery.set(key, {
        query: row.query.trim(),
        clicks: row.clicks,
        impressions: row.impressions,
        positionWeight: row.avg_position * row.impressions,
      });
    }
  }

  const ranked = [...byQuery.values()].sort(
    (a, b) => b.clicks - a.clicks || b.impressions - a.impressions,
  );
  const withClicks = ranked.filter((row) => row.clicks > 0);
  const withoutClicks = ranked.filter((row) => row.clicks === 0);
  const topQueries = [...withClicks, ...withoutClicks.slice(0, Math.max(0, TOP_QUERIES - withClicks.length))].map(
    (row) => ({
      query: row.query,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
      avgPosition: row.impressions > 0 ? row.positionWeight / row.impressions : 0,
    }),
  );
  const clicksInTable = topQueries.reduce((sum, row) => sum + row.clicks, 0);

  return NextResponse.json({
    range,
    freshness,
    totals: {
      clicks,
      impressions,
      ctr: impressions > 0 ? clicks / impressions : 0,
      avgPosition: weightedPosition,
    },
    series,
    topQueries,
    queryCoverage: { clicksInTable, clicksTotal: clicks },
    indexStatus: indexStatus.data
      ? {
          observedOn: indexStatus.data.date,
          indexed: indexStatus.data.indexed_count,
          notIndexed: indexStatus.data.not_indexed_count,
        }
      : null,
  });
}
