import { addDays, todayUtc, toDateString } from "@/lib/dates";
import { parsePageMeta, pickPaths } from "@/lib/ingest/page-meta";
import { upsertRows } from "@/lib/ingest/upsert";
import type { Ingestor, IngestResult } from "@/lib/ingest/types";
import type { PageMeta } from "@/lib/database.types";

/**
 * Page titles and descriptions.
 *
 * Once a day, fetch the public HTML of each active site's most viewed pages
 * over the last 7 stored days and keep what each page says about itself.
 * These are our own public pages; no analytics API is called. A page that
 * fails to load keeps its previous text and records the status and error.
 */

const PAGES_PER_SITE = 50;
const RECENT_DAYS = 7;
const CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 512 * 1024;
/** Stop starting fetches here, well inside the route's 300s limit. */
const BUDGET_MS = 220_000;
const USER_AGENT = "WebSignalsPageInfo/1.0 (reads page titles for the team dashboard)";

type Outcome =
  | { ok: true; path: string; url: string; status: number; meta: ReturnType<typeof parsePageMeta> }
  | { ok: false; path: string; url: string; status: number | null; error: string };

async function readPage(domain: string, path: string): Promise<Outcome> {
  const url = `https://${domain}${path}`;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    const finalUrl = response.url || url;
    if (!response.ok) {
      await response.body?.cancel();
      return { ok: false, path, url: finalUrl, status: response.status, error: `HTTP ${response.status}` };
    }
    const type = response.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) {
      await response.body?.cancel();
      return { ok: false, path, url: finalUrl, status: response.status, error: `Not an HTML page (${type || "no type"})` };
    }
    return { ok: true, path, url: finalUrl, status: response.status, meta: parsePageMeta(await readCapped(response)) };
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
    return {
      ok: false,
      path,
      url,
      status: null,
      error: timedOut ? `No response within ${FETCH_TIMEOUT_MS / 1000}s` : error instanceof Error ? error.message : String(error),
    };
  }
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let bytes = 0;
  while (bytes < MAX_HTML_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => undefined);
  return text;
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>, deadline: number): Promise<R[]> {
  const results: R[] = [];
  let next = 0;
  async function worker() {
    while (next < items.length && Date.now() < deadline) {
      const item = items[next++]!;
      results.push(await work(item));
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
  return results;
}

export const pageMetaIngestor: Ingestor = {
  source: "page-meta",
  async run(ctx): Promise<IngestResult> {
    const deadline = Date.now() + BUDGET_MS;
    const since = toDateString(addDays(todayUtc(), -RECENT_DAYS));
    let read = 0;
    let failed = 0;
    let unread = 0;
    const notes: string[] = [];
    const details: Record<string, number> = {};

    for (const site of ctx.sites) {
      const { data, error } = await ctx.admin
        .from("ga4_page_daily")
        .select("page_path, pageviews")
        .eq("site_id", site.id)
        .gte("date", since);
      if (error) throw new Error(`Could not read top pages for ${site.domain}: ${error.message}`);
      const paths = pickPaths(data ?? [], PAGES_PER_SITE);
      if (paths.length === 0) continue;

      const outcomes = await pool(paths, CONCURRENCY, (path) => readPage(site.domain, path), deadline);
      unread += paths.length - outcomes.length;
      const checkedAt = new Date().toISOString();

      const good: Array<Partial<PageMeta> & Pick<PageMeta, "site_id" | "page_path">> = [];
      const bad: Array<Partial<PageMeta> & Pick<PageMeta, "site_id" | "page_path">> = [];
      for (const outcome of outcomes) {
        if (outcome.ok) {
          good.push({
            site_id: site.id,
            page_path: outcome.path,
            url: outcome.url,
            status_code: outcome.status,
            ...outcome.meta,
            error: null,
            fetched_at: checkedAt,
            checked_at: checkedAt,
          });
        } else {
          bad.push({
            site_id: site.id,
            page_path: outcome.path,
            url: outcome.url,
            status_code: outcome.status,
            error: outcome.error,
            checked_at: checkedAt,
          });
        }
      }

      // Failed rows carry only status columns, so the upsert leaves the last good text in place.
      read += await upsertRows(ctx.admin, "page_meta", good, "site_id,page_path");
      failed += await upsertRows(ctx.admin, "page_meta", bad, "site_id,page_path");
      details[site.domain] = good.length;
      if (bad.length > 0) notes.push(`${site.domain}: ${bad.length} of ${outcomes.length} pages could not be read`);
    }

    if (unread > 0) notes.push(`${unread} pages were left for the next run (time limit).`);
    return {
      rowsWritten: read + failed,
      details: { ...details, read, failed, unread },
      note: notes.length > 0 ? notes.join("; ") : null,
    };
  },
};
