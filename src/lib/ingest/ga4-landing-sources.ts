import type { Ga4LandingSourceDaily } from "@/lib/database.types";

export const LANDING_SOURCE_PAGES_PER_DAY = 50;
export const LANDING_SOURCE_SOURCES_PER_PAGE = 10;

/**
 * Sums duplicates (apex and www hostnames fold into one site), then keeps the
 * busiest landing pages per site per day and the busiest sources per page.
 * The long tail is dropped rather than stored, as with the other GA4 tables.
 */
export function capLandingSources(
  rows: Ga4LandingSourceDaily[],
  pagesPerDay = LANDING_SOURCE_PAGES_PER_DAY,
  sourcesPerPage = LANDING_SOURCE_SOURCES_PER_PAGE,
): Ga4LandingSourceDaily[] {
  const byKey = new Map<string, Ga4LandingSourceDaily>();
  for (const row of rows) {
    const key = `${row.site_id}|${row.date}|${row.page_path}|${row.source}|${row.medium}`;
    const existing = byKey.get(key);
    byKey.set(
      key,
      existing
        ? { ...existing, sessions: existing.sessions + row.sessions, users: existing.users + row.users }
        : { ...row },
    );
  }

  const byPage = new Map<string, Ga4LandingSourceDaily[]>();
  for (const row of byKey.values()) {
    const key = `${row.site_id}|${row.date}|${row.page_path}`;
    const bucket = byPage.get(key);
    if (bucket) bucket.push(row);
    else byPage.set(key, [row]);
  }

  const byDay = new Map<string, Array<{ sessions: number; rows: Ga4LandingSourceDaily[] }>>();
  for (const pageRows of byPage.values()) {
    const first = pageRows[0]!;
    const key = `${first.site_id}|${first.date}`;
    const sessions = pageRows.reduce((total, row) => total + row.sessions, 0);
    const bucket = byDay.get(key);
    const entry = { sessions, rows: pageRows };
    if (bucket) bucket.push(entry);
    else byDay.set(key, [entry]);
  }

  const kept: Ga4LandingSourceDaily[] = [];
  for (const pages of byDay.values()) {
    pages.sort((a, b) => b.sessions - a.sessions);
    for (const page of pages.slice(0, pagesPerDay)) {
      page.rows.sort((a, b) => b.sessions - a.sessions);
      kept.push(...page.rows.slice(0, sourcesPerPage));
    }
  }
  return kept;
}
