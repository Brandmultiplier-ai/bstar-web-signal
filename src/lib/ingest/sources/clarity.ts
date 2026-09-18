import { fetchClarityInsights, type ClarityDimension } from "@/lib/clients/clarity";
import { foldClarityBreakdown, foldClarityPages, weightedRate } from "@/lib/clarity-pages";
import { addDays, todayUtc, toDateString } from "@/lib/dates";
import { upsertRows } from "@/lib/ingest/upsert";
import type { Ingestor, IngestContext, IngestResult } from "@/lib/ingest/types";
import type { ClarityBreakdownDaily, ClarityDaily, ClarityPageDaily, Site } from "@/lib/database.types";

/**
 * Clarity ingestion.
 *
 * Microsoft only returns a trailing 1-day snapshot (numOfDays accepts 1–3 and
 * cannot backfill). We persist that snapshot against yesterday. The next run
 * writes a *new* date row. Older rows are never deleted, so after 10 or 20
 * successful pulls the dashboard can show 10 or 20 stored days. Date chips
 * only filter those stored days — they never call Clarity live.
 *
 * Asking for `dimension1=URL` returns every metric per page, which is what
 * makes the shared project splittable per site: the hostname in each URL maps
 * back to a row in `sites`.
 *
 * Six calls per run (URL + Device + Browser + Source + Country + OS) stay
 * inside the 10-per-day project cap. Cron is daily so a missed day is a
 * missing stored day, not a rolling 3-day blob that would double-count.
 */

/** Matches a Clarity URL host to a site, tolerating the www prefix. */
function resolveSiteId(host: string, sites: Site[]): string | null {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return (
    sites.find((site) => site.domain.toLowerCase().replace(/^www\./, "") === normalized)?.id ?? null
  );
}

export const clarityIngestor: Ingestor = {
  source: "clarity",
  async run(ctx): Promise<IngestResult> {
    // The project is shared, so metrics are keyed by project. Distinct because
    // several site rows point at the same project.
    const projectIds = [
      ...new Set(
        ctx.sites.map((site) => site.clarity_project_id).filter((id): id is string => !!id),
      ),
    ];
    const skipped = ctx.sites.filter((site) => !site.clarity_project_id).map((site) => site.slug);

    if (projectIds.length === 0) {
      return { rowsWritten: 0, skipped };
    }

    // The API token is scoped to a single project, so it can only ever serve
    // the one shared project. More than one would need a token per project.
    if (projectIds.length > 1) {
      throw new Error(
        `Clarity ingestion supports one project per token but the registry has ${projectIds.length}: ${projectIds.join(", ")}`,
      );
    }
    const projectId = projectIds[0];

    const metrics = await fetchClarityInsights(1, ["URL"]);
    const pages = foldClarityPages(metrics);

    // One calendar day per pull. A 3-day aggregate stamped on yesterday would
    // overlap the next pull and inflate All time if we summed stored days.
    const date = toDateString(addDays(todayUtc(), -1));

    const pageRows: ClarityPageDaily[] = pages.map((page) => ({
      clarity_project_id: projectId,
      date,
      page_path: page.pagePath,
      site_id: resolveSiteId(page.host, ctx.sites),
      host: page.host,
      sessions: page.sessions,
      distinct_users: page.distinctUsers,
      scroll_depth_pct: page.scrollDepthPct,
      active_time_seconds: page.activeTimeSeconds,
      total_time_seconds: page.totalTimeSeconds,
      rage_click_pct: page.rageClickPct,
      dead_click_pct: page.deadClickPct,
      excessive_scroll_pct: page.excessiveScrollPct,
      quick_back_pct: page.quickBackPct,
      script_error_pct: page.scriptErrorPct,
    }));

    const pagesWritten = await upsertRows(
      ctx.admin,
      "clarity_page_daily",
      pageRows,
      "clarity_project_id,date,host,page_path",
    );

    // Project-wide rollup. Session and user counts come straight from the
    // undimensioned Traffic totals in the same response; the rates are
    // recomputed from the page rows so they stay consistent with per-site view.
    const projectRow: ClarityDaily = {
      clarity_project_id: projectId,
      date,
      sessions: pages.reduce((sum, page) => sum + page.sessions, 0),
      unique_users: pages.reduce((sum, page) => sum + page.distinctUsers, 0),
      rage_click_pct: weightedRate(pages, (p) => p.rageClickPct),
      dead_click_pct: weightedRate(pages, (p) => p.deadClickPct),
      excessive_scroll_pct: weightedRate(pages, (p) => p.excessiveScrollPct),
      quick_back_pct: weightedRate(pages, (p) => p.quickBackPct),
      scroll_depth_pct: weightedRate(pages, (p) => p.scrollDepthPct),
      active_time_seconds: weightedRate(pages, (p) => p.activeTimeSeconds),
      script_error_pct: weightedRate(pages, (p) => p.scriptErrorPct),
    };

    const dailyWritten = await upsertRows(
      ctx.admin,
      "clarity_daily",
      [projectRow],
      "clarity_project_id,date",
    );

    // Extra dimension calls stay inside the 10/day cap
    // (URL + Device + Browser + Source + Country + OS = 6).
    const breakdowns: ClarityBreakdownDaily[] = [];
    const extra: Array<{ dimension: ClarityBreakdownDaily["dimension"]; api: ClarityDimension }> = [
      { dimension: "device", api: "Device" },
      { dimension: "browser", api: "Browser" },
      { dimension: "source", api: "Source" },
      { dimension: "country", api: "Country" },
      { dimension: "os", api: "OS" },
    ];
    for (const item of extra) {
      try {
        const extraMetrics = await fetchClarityInsights(1, [item.api]);
        for (const row of foldClarityBreakdown(extraMetrics)) {
          breakdowns.push({
            clarity_project_id: projectId,
            date,
            dimension: item.dimension,
            key: row.key,
            sessions: row.sessions,
            distinct_users: row.distinctUsers,
          });
        }
      } catch (error) {
        // A failed extra slice must not wipe the URL-level page data.
        console.error(`Clarity ${item.dimension} breakdown skipped:`, error);
      }
    }

    const breakdownWritten =
      breakdowns.length === 0
        ? 0
        : await upsertRows(
            ctx.admin,
            "clarity_breakdown_daily",
            breakdowns,
            "clarity_project_id,date,dimension,key",
          );

    const matched = pageRows.filter((row) => row.site_id !== null).length;

    return {
      rowsWritten: pagesWritten + dailyWritten + breakdownWritten,
      details: {
        clarity_page_daily: pagesWritten,
        clarity_daily: dailyWritten,
        clarity_breakdown_daily: breakdownWritten,
        pages_matched_to_site: matched,
        pages_unmatched_host: pageRows.length - matched,
      },
      skipped,
    };
  },
};
