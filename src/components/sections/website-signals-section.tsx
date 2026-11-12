"use client";

import { useWebsiteSignals } from "@/lib/hooks";
import { usePageDrillStore } from "@/store/page-drill-store";
import { FreshnessBadge, InfoEye, QueryState } from "@/components/ui";
import { WebsiteSignals } from "@/website-signals-kit/components/WebsiteSignals";
import type { SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";
import { SOURCE_WINDOW_NOTES } from "@/lib/summaries";

/**
 * The Website Signals kit, fed from our stored data.
 *
 * The kit has no slot for data freshness, so the badges sit above it — one per
 * source that feeds the view, since GA4 and Clarity arrive on different
 * cadences and can go stale independently.
 */
export function WebsiteSignalsSection({
  site,
  range,
}: {
  site: SiteSummary;
  range: DateFilter;
}) {
  const { data, isLoading, error } = useWebsiteSignals(site.id, range);
  const openPage = usePageDrillStore((state) => state.open);

  if (!data) {
    return (
      <div className="nos-card">
        <QueryState isLoading={isLoading} error={error} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <FreshnessBadge source="ga4" freshness={data.freshness.ga4} />
        {site.hasClarity && (
          <FreshnessBadge source="clarity" freshness={data.freshness.clarity} />
        )}
        {site.hasSearchConsole && (
          <FreshnessBadge source="gsc" freshness={data.freshness.gsc} />
        )}
        <FreshnessBadge source="calendly" freshness={data.freshness.calendly} />
        <InfoEye text={SOURCE_WINDOW_NOTES.overview} />
      </div>

      <WebsiteSignals data={data.data} onPageSelect={(path) => openPage(site.id, path)} />
    </div>
  );
}
