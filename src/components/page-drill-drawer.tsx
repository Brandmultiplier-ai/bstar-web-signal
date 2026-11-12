"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { Maximize2, X } from "lucide-react";

import { usePageDetail } from "@/lib/hooks";
import { usePageDrillStore } from "@/store/page-drill-store";
import { pageLabel } from "@/lib/page-labels";
import { pageViewHref } from "@/lib/view-links";
import { PageLabelPill } from "@/components/page-path";
import { PageBody, PageInsights, PageLinks } from "@/components/page-detail-body";
import { PanelSkeleton, RefreshBar } from "@/components/ui";
import type { SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";

/**
 * Right-hand panel for one page, for a quick look. Reads /api/metrics/page
 * only, which reads stored rows. "Open full view" goes to the shareable Page
 * view with the same sections and more context.
 */
export function PageDrillDrawer({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const page = usePageDrillStore((state) => state.page);
  const close = usePageDrillStore((state) => state.close);
  const path = page && page.siteId === site.id ? page.path : null;
  const { data, isLoading, isFetching, error } = usePageDetail(site.id, path, range);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (page && page.siteId !== site.id) close();
  }, [page, site.id, close]);

  useEffect(() => {
    if (!path) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, close]);

  if (!path) return null;
  const shown = data && data.path === path ? data : null;
  const label = pageLabel(site.slug, path);
  const title = shown?.meta?.title ?? null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button
        type="button"
        aria-label="Close page details"
        tabIndex={-1}
        onClick={close}
        className="absolute inset-0 bg-black/60"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Page details for ${path}`}
        className="relative flex h-full w-full max-w-[620px] flex-col overflow-y-auto border-l border-[var(--border)] bg-[var(--nos-bg-surface)] shadow-2xl"
      >
        {isFetching && shown && <RefreshBar />}
        <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--nos-bg-surface)] px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-label-caps">Page · {site.domain}</p>
              <h2 className="mt-1 break-all text-lg font-bold text-white">{path}</h2>
              {(title || label) && (
                <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--nos-text-secondary)]">
                  {label && <PageLabelPill label={label.label} />}
                  {title}
                </p>
              )}
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Close"
              className="rounded-lg p-1.5 text-[var(--nos-text-secondary)] hover:bg-white/10 hover:text-white"
            >
              <X size={18} />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={pageViewHref(site.slug, path, range)}
              onClick={close}
              className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-white"
              style={{ background: "var(--vui-gradient-brand)" }}
            >
              <Maximize2 size={13} /> Open full view
            </Link>
            <PageLinks domain={site.domain} path={path} clarityProjectId={shown?.site.clarityProjectId ?? null} />
          </div>
        </header>

        <div className="space-y-7 px-6 py-5">
          {!shown ? (
            isLoading || isFetching ? (
              <PanelSkeleton tiles={6} table={false} />
            ) : (
              <p className="text-sm text-[var(--nos-negative)]">
                {error instanceof Error ? error.message : "Something went wrong."}
              </p>
            )
          ) : (
            <>
              <PageInsights insights={shown.insights} />
              <PageBody data={shown} siteSlug={site.slug} range={range} onNavigate={close} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
