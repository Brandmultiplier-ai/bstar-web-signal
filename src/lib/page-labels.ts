import { normalisePath } from "./read/page-detail";

export type PageLabel = { label: string; note?: string };

/**
 * Short context for pages whose numbers need it, keyed by site slug, then by
 * path as GA4 reports it. A trailing slash, query string or hash on the
 * looked-up path does not matter.
 */
export const PAGE_LABELS: Record<string, Record<string, PageLabel>> = {
  brandmultiplier: {
    "/blog/the-narrative-flywheel-driving-continuous-engagement": {
      label: "Flywheel article",
      note: "Blog post explaining the narrative flywheel.",
    },
  },
};

export function pageLabel(siteSlug: string | undefined, path: string | null | undefined): PageLabel | null {
  if (!siteSlug) return null;
  const labels = PAGE_LABELS[siteSlug];
  const key = normalisePath(path);
  if (!labels || !key) return null;
  if (labels[key]) return labels[key];
  for (const [labelled, label] of Object.entries(labels)) {
    if (normalisePath(labelled) === key) return label;
  }
  return null;
}
