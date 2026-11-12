import { normalisePath } from "./read/page-detail";

export type PageLabel = { label: string; note?: string };

/**
 * Optional context for a page, keyed by site slug, then by path as GA4
 * reports it. A trailing slash, query string or hash on the looked-up path
 * does not matter. Pages with no entry get a label taken from the path.
 */
export const PAGE_LABELS: Record<string, Record<string, PageLabel>> = {};

export function pageLabel(siteSlug: string | undefined, path: string | null | undefined): PageLabel | null {
  const key = normalisePath(path);
  if (!key) return null;

  const labels = siteSlug ? PAGE_LABELS[siteSlug] : undefined;
  if (labels) {
    if (labels[key]) return labels[key];
    for (const [labelled, label] of Object.entries(labels)) {
      if (normalisePath(labelled) === key) return label;
    }
  }

  return { label: labelFromPath(key) };
}

/** Last path segment, with hyphens and underscores read as spaces. `/` is Home. */
function labelFromPath(path: string): string {
  if (path === "/") return "Home";
  const segment = path.split("/").filter(Boolean).pop() ?? path;
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    decoded = segment;
  }
  return decoded.replace(/[-_]+/g, " ").trim() || path;
}
