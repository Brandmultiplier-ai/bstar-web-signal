/**
 * Shareable links to the full Page and Source views. The site travels as its
 * slug and the date range in the same form the metrics routes read, so a
 * pasted link opens on the same numbers.
 */

export type RangeParams = { days?: number; start?: string; end?: string; all?: boolean };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function rangeSearch(range: RangeParams, params: URLSearchParams) {
  if (range.all) params.set("all", "1");
  else if (range.start && range.end) {
    params.set("start", range.start);
    params.set("end", range.end);
  } else params.set("days", String(range.days ?? 30));
}

export function pageViewHref(siteSlug: string, path: string, range: RangeParams): string {
  const params = new URLSearchParams({ site: siteSlug, path });
  rangeSearch(range, params);
  return `/pages/view?${params.toString()}`;
}

export function sourceViewHref(siteSlug: string, source: string, medium: string, range: RangeParams): string {
  const params = new URLSearchParams({ site: siteSlug, source, medium });
  rangeSearch(range, params);
  return `/sources/view?${params.toString()}`;
}

/** The range a view link carries, or null when it carries none or a malformed one. */
export function rangeFromSearch(params: URLSearchParams): RangeParams | null {
  if (params.get("all") === "1") return { all: true };
  const start = params.get("start");
  const end = params.get("end");
  if (start && end && DATE.test(start) && DATE.test(end) && start <= end) return { start, end };
  const days = Number(params.get("days"));
  if (Number.isInteger(days) && days > 0 && days <= 365) return { days };
  return null;
}
