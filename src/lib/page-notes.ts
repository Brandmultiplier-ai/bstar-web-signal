import { normalisePath } from "./read/page-detail";

/**
 * What a page is for, written by the team, keyed by site slug and then by
 * path as GA4 reports it. Shown above the numbers in the page views. Leave a
 * page out rather than guess: the page's own title and description are
 * shown either way.
 *
 * Example:
 *   brandmultiplier: {
 *     "/pricing": "The pricing page linked from every proposal email.",
 *   },
 */
export const PAGE_NOTES: Record<string, Record<string, string>> = {};

export function pageNote(siteSlug: string | undefined, path: string | null | undefined): string | null {
  const key = normalisePath(path);
  if (!key || !siteSlug) return null;
  const notes = PAGE_NOTES[siteSlug];
  if (!notes) return null;
  if (notes[key]) return notes[key];
  for (const [noted, note] of Object.entries(notes)) {
    if (normalisePath(noted) === key) return note;
  }
  return null;
}
