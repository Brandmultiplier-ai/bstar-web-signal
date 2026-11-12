"use client";

import { formatLongDate } from "@/lib/dates";
import { pageNote } from "@/lib/page-notes";
import { SubHeading } from "@/components/ui";
import type { PageDetailResponse } from "@/lib/api-types";

/** "What this page is": the team's note, then what the live page says about itself. */
export function PageIdentity({ data, siteSlug }: { data: PageDetailResponse; siteSlug: string }) {
  const note = pageNote(siteSlug, data.path);
  const meta = data.meta;
  const redirected = meta?.url && !sameAddress(meta.url, data.site.domain, data.path) ? meta.url : null;
  const heading = meta?.h1 && meta.h1 !== meta.title ? meta.h1 : null;

  return (
    <section>
      <SubHeading
        title="What this page is"
        info={[
          "The team's note, if there is one, then the page's own title, description and main heading, read from the live page once a day.",
          "Notes live in src/lib/page-notes.ts.",
        ]}
      />
      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)] px-4 py-3.5 text-sm">
        {note && (
          <div>
            <p className="text-label-caps">Team note</p>
            <p className="mt-1 leading-relaxed text-white">{note}</p>
          </div>
        )}
        {meta ? (
          <>
            {(meta.description || meta.title) && (
              <div>
                <p className="text-label-caps">The page describes itself as</p>
                <p className="mt-1 leading-relaxed text-white">
                  {meta.description ?? meta.title}
                </p>
              </div>
            )}
            {heading && (
              <div>
                <p className="text-label-caps">Main heading</p>
                <p className="mt-1 text-[var(--nos-text-secondary)]">{heading}</p>
              </div>
            )}
            {!meta.description && !meta.title && !meta.error && (
              <p className="text-[var(--nos-text-secondary)]">
                The page loaded but has no title, description or heading. Pages like this are often redirects or tracking steps rather than content.
              </p>
            )}
            {redirected && (
              <p className="text-xs text-[var(--nos-text-secondary)]">
                Opening this address ends up at <span className="break-all text-white">{redirected}</span>.
              </p>
            )}
            {meta.error && (
              <p className="text-xs text-[var(--nos-negative)]">
                The last read failed: {meta.error}.{meta.fetchedAt ? " Showing what the page said before." : ""}
              </p>
            )}
            <p className="text-[11px] text-[var(--nos-text-muted)]">
              {meta.fetchedAt ? `Read from the live page on ${formatLongDate(meta.fetchedAt.slice(0, 10))}.` : `Last tried on ${formatLongDate(meta.checkedAt.slice(0, 10))}.`}
            </p>
          </>
        ) : (
          !note && <p className="text-[var(--nos-text-muted)]">{data.metaReason}</p>
        )}
        {!note && meta && (
          <p className="text-[11px] text-[var(--nos-text-muted)]">No team note for this page yet.</p>
        )}
      </div>
    </section>
  );
}

function sameAddress(url: string, domain: string, path: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const trim = (value: string) => (value.length > 1 ? value.replace(/\/+$/, "") : value);
    return host === domain.replace(/^www\./, "") && trim(parsed.pathname) === trim(path);
  } catch {
    return true;
  }
}
