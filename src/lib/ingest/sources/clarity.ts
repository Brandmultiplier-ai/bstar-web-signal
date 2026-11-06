import { fetchClarityInsights } from "@/lib/clients/clarity";
import { env } from "@/lib/env";
import { addDays, todayUtc, toDateString } from "@/lib/dates";
import { collectClarityProjects } from "@/lib/ingest/clarity-projects";
import { upsertRows } from "@/lib/ingest/upsert";
import type { Ingestor, IngestContext, IngestResult } from "@/lib/ingest/types";

/**
 * Clarity ingestion.
 *
 * Microsoft only returns a trailing 1-day snapshot (numOfDays accepts 1–3 and
 * cannot backfill). We persist that snapshot against yesterday. The next run
 * writes a *new* date row. Older rows are never deleted, so after 10 or 20
 * successful pulls the dashboard can show 10 or 20 stored days. Date chips
 * only filter those stored days — they never call Clarity live.
 *
 * Each active project uses the token named in src/lib/clarity-tokens.ts.
 * Six calls per project (URL + Device + Browser + Source + Country + OS)
 * stay inside that project's own 10-per-day cap. A failed project is named
 * on the run and does not stop the others.
 */

export const clarityIngestor: Ingestor = {
  source: "clarity",
  async run(ctx): Promise<IngestResult> {
    const date = toDateString(addDays(todayUtc(), -1));
    const collected = await collectClarityProjects({
      sites: ctx.sites,
      date,
      readEnv: (name) => env.clarityToken(name),
      fetchInsights: (token, dimensions) => fetchClarityInsights(1, dimensions, token),
    });
    if (!collected.ok) throw new Error(collected.message ?? "Clarity failed.");

    let pagesWritten = 0;
    let dailyWritten = 0;
    let breakdownWritten = 0;
    let matched = 0;
    let unmatched = 0;
    const writeFailed: string[] = [];

    for (const project of collected.projects) {
      try {
        pagesWritten += await upsertRows(
          ctx.admin,
          "clarity_page_daily",
          project.pages,
          "clarity_project_id,date,host,page_path",
        );
        dailyWritten += await upsertRows(
          ctx.admin,
          "clarity_daily",
          [project.daily],
          "clarity_project_id,date",
        );
        if (project.breakdowns.length > 0) {
          breakdownWritten += await upsertRows(
            ctx.admin,
            "clarity_breakdown_daily",
            project.breakdowns,
            "clarity_project_id,date,dimension,key",
          );
        }
        matched += project.pages.filter((row) => row.site_id !== null).length;
        unmatched += project.pages.filter((row) => row.site_id === null).length;
      } catch {
        console.error("[clarity] failed", project.domains.join(","));
        writeFailed.push(...project.domains);
      }
    }

    if (collected.projects.length > 0 && writeFailed.length > 0 && pagesWritten + dailyWritten === 0) {
      const message = [collected.note, `Clarity failed for ${writeFailed.join(", ")}.`]
        .filter(Boolean)
        .join(" ");
      throw new Error(message);
    }

    const note = [collected.note, writeFailed.length > 0 ? `Clarity failed for ${writeFailed.join(", ")}.` : null]
      .filter(Boolean)
      .join(" ");

    return {
      rowsWritten: pagesWritten + dailyWritten + breakdownWritten,
      details: {
        clarity_page_daily: pagesWritten,
        clarity_daily: dailyWritten,
        clarity_breakdown_daily: breakdownWritten,
        pages_matched_to_site: matched,
        pages_unmatched_host: unmatched,
      },
      skipped: collected.skipped,
      note: note.length > 0 ? note : null,
    };
  },
};
