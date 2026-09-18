import { createSearchConsoleClient } from "@/lib/clients/google";
import { todayUtc, toDateString } from "@/lib/dates";
import { upsertRows } from "@/lib/ingest/upsert";
import type { Ingestor, IngestContext, IngestResult } from "@/lib/ingest/types";
import type { GscDaily, GscIndexStatus, GscQueryDaily, Site } from "@/lib/database.types";

type SearchConsole = Awaited<ReturnType<typeof createSearchConsoleClient>>;

type AnalyticsRow = {
  keys?: string[] | null;
  clicks?: number | null;
  impressions?: number | null;
  ctr?: number | null;
  position?: number | null;
};

const TOP_QUERIES_PER_DAY = 25;
const API_ROW_LIMIT = 25_000;

/**
 * Search Console is a per-site property, so unlike GA4 there is no sharing to
 * untangle here. Sites without a `gsc_site_url` are skipped.
 *
 * Each run upserts the lookback window. Older stored days are never deleted.
 * Date chips only filter those stored clicks, impressions, and queries.
 */
async function queryAnalytics(
  api: SearchConsole,
  siteUrl: string,
  body: Record<string, unknown>,
): Promise<AnalyticsRow[]> {
  const rows: AnalyticsRow[] = [];
  let startRow = 0;

  for (;;) {
    const response = await api.searchanalytics.query({
      siteUrl,
      requestBody: { ...body, rowLimit: API_ROW_LIMIT, startRow },
    });
    const page = response.data.rows ?? [];
    rows.push(...page);
    if (page.length < API_ROW_LIMIT) break;
    startRow += page.length;
  }

  return rows;
}

async function ingestDaily(
  api: SearchConsole,
  ctx: IngestContext,
  site: Site,
): Promise<GscDaily[]> {
  const rows = await queryAnalytics(api, site.gsc_site_url!, {
    startDate: ctx.window.start,
    endDate: ctx.window.end,
    dimensions: ["date"],
  });

  return rows.map((row) => ({
    site_id: site.id,
    date: String((row.keys as string[])[0]),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0),
    avg_position: Number(row.position ?? 0),
  }));
}

async function ingestQueries(
  api: SearchConsole,
  ctx: IngestContext,
  site: Site,
): Promise<GscQueryDaily[]> {
  const rows = await queryAnalytics(api, site.gsc_site_url!, {
    startDate: ctx.window.start,
    endDate: ctx.window.end,
    dimensions: ["date", "query"],
  });

  const mapped = rows.map((row) => {
    const keys = row.keys as string[];
    return {
      site_id: site.id,
      date: String(keys[0]),
      query: String(keys[1]),
      clicks: Number(row.clicks ?? 0),
      impressions: Number(row.impressions ?? 0),
      ctr: Number(row.ctr ?? 0),
      avg_position: Number(row.position ?? 0),
    } satisfies GscQueryDaily;
  });

  // Keep only the strongest queries per day; the tail is thousands of rows of
  // single impressions that the dashboard never shows.
  const byDay = new Map<string, GscQueryDaily[]>();
  for (const row of mapped) {
    const bucket = byDay.get(row.date);
    if (bucket) bucket.push(row);
    else byDay.set(row.date, [row]);
  }

  const kept: GscQueryDaily[] = [];
  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => b.impressions - a.impressions);
    kept.push(...bucket.slice(0, TOP_QUERIES_PER_DAY));
  }
  return kept;
}

/**
 * Index coverage is a snapshot, not a time series: the API only ever reports
 * the current state, so we stamp it with today's date. `urlInspection` is
 * per-URL and far too slow for a whole site, so we derive coverage from the
 * sitemap summaries, which report submitted versus indexed per sitemap.
 */
async function ingestIndexStatus(api: SearchConsole, site: Site): Promise<GscIndexStatus[]> {
  const response = await api.sitemaps.list({ siteUrl: site.gsc_site_url! });
  const sitemaps = response.data.sitemap ?? [];

  let submitted = 0;
  let indexed = 0;
  for (const sitemap of sitemaps) {
    for (const contents of sitemap.contents ?? []) {
      submitted += Number(contents.submitted ?? 0);
      indexed += Number(contents.indexed ?? 0);
    }
  }

  // No sitemap registered means we have nothing to report; writing zeroes
  // would look like a sudden deindexing.
  if (sitemaps.length === 0) return [];

  return [
    {
      site_id: site.id,
      date: toDateString(todayUtc()),
      indexed_count: indexed,
      not_indexed_count: Math.max(submitted - indexed, 0),
    },
  ];
}

export const gscIngestor: Ingestor = {
  source: "gsc",
  async run(ctx): Promise<IngestResult> {
    const targets = ctx.sites.filter((site) => site.gsc_site_url);
    const skipped = ctx.sites.filter((site) => !site.gsc_site_url).map((site) => site.slug);

    const details: Record<string, number> = {
      gsc_daily: 0,
      gsc_query_daily: 0,
      gsc_index_status: 0,
    };

    if (targets.length === 0) {
      return { rowsWritten: 0, details, skipped };
    }

    const api = await createSearchConsoleClient();

    for (const site of targets) {
      const [daily, queries, indexStatus] = await Promise.all([
        ingestDaily(api, ctx, site),
        ingestQueries(api, ctx, site),
        ingestIndexStatus(api, site),
      ]);

      details.gsc_daily += await upsertRows(ctx.admin, "gsc_daily", daily, "site_id,date");
      details.gsc_query_daily += await upsertRows(
        ctx.admin,
        "gsc_query_daily",
        queries,
        "site_id,date,query",
      );
      details.gsc_index_status += await upsertRows(
        ctx.admin,
        "gsc_index_status",
        indexStatus,
        "site_id,date",
      );
    }

    return {
      rowsWritten: Object.values(details).reduce((sum, n) => sum + n, 0),
      details,
      skipped,
    };
  },
};
