"use client";

import { MousePointerClick } from "lucide-react";

import { useClarity } from "@/lib/hooks";
import { usePageDrillStore } from "@/store/page-drill-store";
import {
  Panel,
  QueryState,
  RankList,
  SimpleTable,
  Stat,
  SubHeading,
  StatGrid,
  formatDuration,
  formatNumber,
  formatRate,
  type TableColumn,
} from "@/components/ui";
import { DonutChart } from "@/website-signals-kit/components/charts/DonutChart";
import { HistogramBar } from "@/website-signals-kit/components/charts/HistogramBar";
import { HorizontalBars } from "@/website-signals-kit/components/charts/HorizontalBars";
import { TrendLine } from "@/website-signals-kit/components/charts/TrendLine";
import type { ClarityResponse, SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";
import { partialCoverage } from "@/lib/format";
import { clarityStatusText } from "@/lib/freshness";
import { CLARITY_METRIC_DEFS, REPORT_BLURBS, SOURCE_WINDOW_NOTES } from "@/lib/summaries";

/** Donut and bar charts draw at most this many rows. Coverage uses the same cut. */
const CHART_ROWS = 8;

function shownSum(rows: Array<{ value: number }>): number {
  return rows
    .filter((row) => row.value > 0)
    .slice(0, CHART_ROWS)
    .reduce((sum, row) => sum + row.value, 0);
}

export function ClaritySection({
  site,
  range,
}: {
  site?: SiteSummary;
  range: DateFilter;
}) {
  const { data, isLoading, isFetching, error } = useClarity(range, site?.id);
  const openPage = usePageDrillStore((state) => state.open);
  const openPath = usePageDrillStore((state) =>
    site && state.page?.siteId === site.id ? state.page.path : null,
  );
  const siteHost = site ? site.domain.toLowerCase().replace(/^www\./, "") : null;

  const pageCoverage = data
    ? partialCoverage(
        data.topPages.reduce((sum, row) => sum + row.sessions, 0),
        data.totals.sessions,
        "sessions",
      )
    : null;
  const hasRage = data?.totals.rageClickPct !== null;
  const hasDead = data?.totals.deadClickPct !== null;
  const hasQuick = data?.totals.quickBackPct !== null;
  const hasJs = data?.totals.scriptErrorPct !== null;
  const hasScroll = data?.totals.scrollDepthPct !== null;
  const hasExcessive = data?.totals.excessiveScrollPct !== null;

  return (
    <Panel
      refreshing={Boolean(data) && isFetching}
      title="Microsoft Clarity"
      subtitle={
        site
          ? `Pages for ${site.domain}. Date chips re-read stored days — they do not call Clarity.`
          : "Shared project. Date changes read stored days only."
      }
      note={[SOURCE_WINDOW_NOTES.clarity, clarityStatusText(data?.freshness)].filter(Boolean).join(" ")}
      info={REPORT_BLURBS.clarity}
      source="clarity"
      freshness={data?.freshness}
      icon={MousePointerClick}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">

          <StatGrid>
            <Stat label="Sessions" value={formatNumber(data.totals.sessions)} />
            <Stat label="Unique users" value={formatNumber(data.totals.uniqueUsers)} />
            {hasRage && (
              <Stat
                label="Rage clicks"
                value={formatRate(data.totals.rageClickPct)}
                tip={CLARITY_METRIC_DEFS.rage}
              />
            )}
            {hasDead && (
              <Stat
                label="Dead clicks"
                value={formatRate(data.totals.deadClickPct)}
                tip={CLARITY_METRIC_DEFS.dead}
              />
            )}
            {hasQuick && (
              <Stat
                label="Quick backs"
                value={formatRate(data.totals.quickBackPct)}
                tip={CLARITY_METRIC_DEFS.quickBack}
              />
            )}
            {hasJs && (
              <Stat
                label="JS errors"
                value={formatRate(data.totals.scriptErrorPct)}
                tip={CLARITY_METRIC_DEFS.jsError}
              />
            )}
            {hasScroll && (
              <Stat
                label="Scroll depth"
                value={formatRate(data.totals.scrollDepthPct)}
                tip={CLARITY_METRIC_DEFS.scroll}
              />
            )}
            {hasExcessive && (
              <Stat
                label="Excessive scroll"
                value={formatRate(data.totals.excessiveScrollPct)}
                tip={CLARITY_METRIC_DEFS.excessive}
              />
            )}
            {data.totals.activeTimeSeconds !== null && (
              <Stat
                label="Active time"
                value={formatDuration(data.totals.activeTimeSeconds)}
                tip="Average time per session spent actually interacting with the page."
              />
            )}
          </StatGrid>

          {data.series.length > 0 && (
            <div className="grid items-start gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <HistogramBar
                  data={data.series.map((row) => ({
                    date: row.date,
                    sessions: row.sessions,
                    users: row.uniqueUsers,
                  }))}
                  title="Sessions by day"
                  subtitle="Only days already saved in the database"
                />
              </div>
              {hasScroll && (
                <div className="lg:col-span-2">
                  <TrendLine
                    data={data.series
                      .filter((row) => row.scrollDepthPct !== null)
                      .map((row) => ({ date: row.date, value: row.scrollDepthPct ?? 0 }))}
                    title="Scroll depth"
                    subtitle="Session-weighted, stored daily"
                    color="#01b574"
                    yAxisLabel="%"
                  />
                </div>
              )}
            </div>
          )}

          {(hasRage || data.totals.activeTimeSeconds !== null) && (
            <div className="grid items-start gap-5 lg:grid-cols-2">
              {hasRage && (
                <TrendLine
                  data={data.series
                    .filter((row) => row.rageClickPct !== null)
                    .map((row) => ({ date: row.date, value: row.rageClickPct ?? 0 }))}
                  title="Rage clicks"
                  subtitle={CLARITY_METRIC_DEFS.rage}
                  color="#e31a1a"
                  yAxisLabel="%"
                />
              )}
              {data.totals.activeTimeSeconds !== null && (
                <TrendLine
                  data={data.series
                    .filter((row) => row.activeTimeSeconds !== null)
                    .map((row) => ({ date: row.date, value: row.activeTimeSeconds ?? 0 }))}
                  title="Active time"
                  subtitle="Seconds per session, stored daily"
                  color="#21d4fd"
                  yAxisLabel="sec"
                />
              )}
            </div>
          )}

          <div className="grid items-start gap-5 md:grid-cols-3">
            {data.devices.length > 0 && (
              <DonutChart
                data={data.devices}
                title="Device"
                subtitle={
                  partialCoverage(shownSum(data.devices), data.totals.sessions, "sessions") ??
                  "Clarity sessions"
                }
              />
            )}
            {data.browsers.length > 0 && (
              <DonutChart
                data={data.browsers}
                title="Browser"
                subtitle={
                  partialCoverage(shownSum(data.browsers), data.totals.sessions, "sessions") ??
                  "Clarity sessions"
                }
              />
            )}
            {data.operatingSystems.length > 0 && (
              <DonutChart
                data={data.operatingSystems}
                title="Operating system"
                subtitle={
                  partialCoverage(
                    shownSum(data.operatingSystems),
                    data.totals.sessions,
                    "sessions",
                  ) ?? "Clarity sessions"
                }
              />
            )}
          </div>

          <div className="grid items-start gap-5 md:grid-cols-3">
            {data.sources.length > 0 && (
              <DonutChart
                data={data.sources}
                title="Traffic source"
                subtitle={
                  partialCoverage(shownSum(data.sources), data.totals.sessions, "sessions") ??
                  "Clarity source"
                }
              />
            )}
            {data.countries.length > 0 && (
              <DonutChart
                data={data.countries}
                title="Countries"
                subtitle={
                  partialCoverage(shownSum(data.countries), data.totals.sessions, "sessions") ??
                  "Clarity sessions"
                }
              />
            )}
            {data.byHost.length > 1 && (
              <DonutChart
                data={data.byHost}
                title="By site"
                subtitle={
                  partialCoverage(shownSum(data.byHost), data.totals.sessions, "sessions") ??
                  "Sessions on each host"
                }
              />
            )}
          </div>

          {data.topPages.length > 0 && (
            <HorizontalBars
              data={data.topPages.map((row) => ({
                name: `${row.host.replace(/^www\./, "")}${row.pagePath}`,
                value: row.sessions,
              }))}
              title="Busiest pages"
              subtitle={
                partialCoverage(
                  shownSum(data.topPages.map((row) => ({ value: row.sessions }))),
                  data.totals.sessions,
                  "sessions",
                ) ?? "Sessions, split by hostname"
              }
              color="#21d4fd"
            />
          )}

          <div>
            <SubHeading
              title="Page behaviour"
              info={[
                pageCoverage ?? "",
                "Click a column header to sort. Rates are session-weighted across the range.",
                site ? "Click a row for that page's details." : "",
              ].filter(Boolean)}
            />
            <SimpleTable
              rows={data.topPages}
              empty="No Clarity pages stored in this range yet."
              columns={pageColumns({ hasScroll, hasExcessive, hasRage, hasDead, hasQuick, hasJs })}
              onRowClick={
                siteHost
                  ? (row) => {
                      if (row.host === siteHost) openPage(site!.id, row.pagePath);
                    }
                  : undefined
              }
              isSelected={(row) => row.host === siteHost && row.pagePath === openPath}
            />
          </div>

          {(hasRage || hasDead) && (
            <RankList
              title={`Pages with the most click friction (rage plus dead clicks, pages with ${FRICTION_MIN_SESSIONS}+ sessions)`}
              rows={data.topPages
                .filter((row) => row.sessions >= FRICTION_MIN_SESSIONS)
                .map((row) => ({
                  name: `${row.host.replace(/^www\./, "")}${row.pagePath}`,
                  value: (row.rageClickPct ?? 0) + (row.deadClickPct ?? 0),
                }))
                .filter((row) => row.value > 0)
                .sort((a, b) => b.value - a.value)
                .slice(0, CHART_ROWS)}
              empty="No page with enough sessions shows rage or dead clicks."
              format={(value) => formatRate(value)}
            />
          )}
        </div>
      )}
    </Panel>
  );
}

const FRICTION_MIN_SESSIONS = 5;

type PageRow = ClarityResponse["topPages"][number];

function pageColumns(show: {
  hasScroll: boolean;
  hasExcessive: boolean;
  hasRage: boolean;
  hasDead: boolean;
  hasQuick: boolean;
  hasJs: boolean;
}): Array<TableColumn<PageRow>> {
  const rate = (header: string, pick: (row: PageRow) => number | null): TableColumn<PageRow> => ({
    header,
    align: "right",
    cell: (row) => formatRate(pick(row)),
    sortValue: pick,
  });
  return [
    { header: "Host", cell: (row) => row.host, sortValue: (row) => row.host },
    { header: "Path", cell: (row) => row.pagePath, sortValue: (row) => row.pagePath },
    {
      header: "Sessions",
      align: "right",
      cell: (row) => formatNumber(row.sessions),
      sortValue: (row) => row.sessions,
    },
    {
      header: "Users",
      align: "right",
      cell: (row) => formatNumber(row.distinctUsers),
      sortValue: (row) => row.distinctUsers,
    },
    ...(show.hasScroll ? [rate("Scroll", (row) => row.scrollDepthPct)] : []),
    ...(show.hasExcessive ? [rate("Excessive", (row) => row.excessiveScrollPct)] : []),
    {
      header: "Active",
      align: "right",
      cell: (row) => formatDuration(row.activeTimeSeconds),
      sortValue: (row) => row.activeTimeSeconds,
    },
    ...(show.hasRage ? [rate("Rage", (row) => row.rageClickPct)] : []),
    ...(show.hasDead ? [rate("Dead", (row) => row.deadClickPct)] : []),
    ...(show.hasQuick ? [rate("Quick back", (row) => row.quickBackPct)] : []),
    ...(show.hasJs ? [rate("JS errors", (row) => row.scriptErrorPct)] : []),
  ];
}
