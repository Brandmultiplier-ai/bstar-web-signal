"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { usePageDetail } from "@/lib/hooks";
import { pageLabel } from "@/lib/page-labels";
import { DetailShell, useDetailContext } from "@/components/detail-shell";
import { PageLabelPill } from "@/components/page-path";
import { PageBody, PageInsights, PageLinks, liveUrl } from "@/components/page-detail-body";
import { PageIdentity } from "@/components/page-identity";
import { PageRecordings } from "@/components/page-recordings";
import { LoadingScrim, OpeningState } from "@/components/ui";
import { useNavigationStore } from "@/store/navigation-store";

/** Full, shareable view of one page: what it is, who sends people to it, and how they behave. */
export function PageView() {
  const params = useSearchParams();
  const path = params.get("path");
  const { site, range, isLoading: sitesLoading, error: siteError } = useDetailContext();
  const { data, isLoading, isFetching, error } = usePageDetail(site?.id, path, range);
  const label = site && path ? pageLabel(site.slug, path) : null;
  const shown = data && data.path === path ? data : null;
  const title = shown?.meta?.title ?? label?.label ?? path ?? "Page";
  const clearNavigation = useNavigationStore((state) => state.clear);

  useEffect(() => {
    if (shown || error || siteError || !path) clearNavigation();
  }, [shown, error, siteError, path, clearNavigation]);

  return (
    <DetailShell
      trail={["Pages", site?.displayName ?? "…", label?.label ?? path ?? ""]}
      isLoading={sitesLoading}
      error={!path ? "No page given. Open a page from the dashboard." : siteError}
    >
      {site && path && (
        <div className="relative space-y-8">
          <div className={isFetching && shown ? "pointer-events-none space-y-8 blur-[2px]" : "space-y-8"}>
          <div>
            <p className="text-label-caps">Page on {site.domain}</p>
            <h1 className="mt-1 text-[26px] font-bold leading-tight text-white">{title}</h1>
            <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-[var(--nos-text-secondary)]">
              <a
                href={liveUrl(site.domain, path)}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all underline decoration-white/20 underline-offset-4 hover:text-white"
              >
                {liveUrl(site.domain, path)}
              </a>
              {label && label.label !== title && <PageLabelPill label={label.label} />}
            </p>
            <PageLinks domain={site.domain} path={path} clarityProjectId={shown?.site.clarityProjectId ?? null} />
          </div>

          {!shown ? (
            isLoading || isFetching ? (
              <OpeningState label="Loading this page" />
            ) : (
              <p className="text-sm text-[var(--nos-negative)]">
                {error instanceof Error ? error.message : "Something went wrong."}
              </p>
            )
          ) : (
            <>
              <div className="grid items-start gap-6 lg:grid-cols-2">
                <PageIdentity data={shown} siteSlug={site.slug} />
                <PageInsights insights={shown.insights} />
              </div>
              <PageRecordings data={shown} />
              <PageBody data={shown} siteId={site.id} siteSlug={site.slug} range={range} wide />
            </>
          )}
          </div>
          {isFetching && shown && <LoadingScrim label="Updating" />}
        </div>
      )}
    </DetailShell>
  );
}
