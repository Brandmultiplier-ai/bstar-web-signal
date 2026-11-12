"use client";

import { BarChart3 } from "lucide-react";

import { useGa4 } from "@/lib/hooks";
import { usePageDrillStore } from "@/store/page-drill-store";
import {
  InfoEye,
  Panel,
  QueryState,
  SimpleTable,
  SubHeading,
  Stat,
  StatGrid,
  formatDuration,
  formatNumber,
  formatPercent,
} from "@/components/ui";
import { DonutChart } from "@/website-signals-kit/components/charts/DonutChart";
import { HistogramBar } from "@/website-signals-kit/components/charts/HistogramBar";
import { HorizontalBars } from "@/website-signals-kit/components/charts/HorizontalBars";
import { TrendLine } from "@/website-signals-kit/components/charts/TrendLine";
import type { SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";
import { partialCoverage } from "@/lib/format";

/** Donut and bar charts draw at most this many rows. Coverage uses the same cut. */
const CHART_ROWS = 8;

function shownSum(rows: Array<{ value: number }>): number {
  return rows
    .filter((row) => row.value > 0)
    .slice(0, CHART_ROWS)
    .reduce((sum, row) => sum + row.value, 0);
}

function withSortHint(what: string, coverage: string | null): string[] {
  return [what, coverage ?? "", "Click a column header to sort."].filter(Boolean);
}
import { REPORT_BLURBS, SOURCE_WINDOW_NOTES } from "@/lib/summaries";

export function Ga4Section({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const { data, isLoading, isFetching, error } = useGa4(site.id, range);
  const openPage = usePageDrillStore((state) => state.open);
  const openPath = usePageDrillStore((state) => (state.page?.siteId === site.id ? state.page.path : null));
  const pageRowProps = {
    onRowClick: (row: { page_path: string }) => openPage(site.id, row.page_path),
    isSelected: (row: { page_path: string }) => row.page_path === openPath,
  };

  return (
    <Panel
      refreshing={Boolean(data) && isFetching}
      title="Google Analytics"
      subtitle={`Stored traffic for ${site.domain}. Date chips re-read these tables — they never call Google.`}
      note={[SOURCE_WINDOW_NOTES.ga4, data?.freshness.note].filter(Boolean).join(" ")}
      info={REPORT_BLURBS.ga4}
      source="ga4"
      freshness={data?.freshness}
      icon={BarChart3}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">
          <StatGrid>
            <Stat label="Sessions" value={formatNumber(data.totals.sessions)} />
            <Stat label="Users" value={formatNumber(data.totals.users)} />
            <Stat label="New users" value={formatNumber(data.totals.newUsers)} />
            <Stat label="Pageviews" value={formatNumber(data.totals.pageviews)} />
            <Stat label="Engagement" value={formatPercent(data.totals.engagementRate)} />
            <Stat label="Bounce" value={formatPercent(data.totals.bounceRate)} />
            <Stat label="Avg. duration" value={formatDuration(data.totals.avgSessionDuration)} />
            <Stat
              label="Pages / session"
              tip="Average pages viewed per session."
              value={
                data.totals.pagesPerSession === null
                  ? "—"
                  : data.totals.pagesPerSession.toFixed(2)
              }
            />
          </StatGrid>

          {data.series.length > 0 && (
            <div className="grid items-start gap-5 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <HistogramBar
                  data={data.series}
                  title="Traffic by day"
                  subtitle="Blue sessions, cyan users, green new users — all stored daily"
                />
              </div>
              <div className="lg:col-span-2">
                <TrendLine
                  data={data.series.map((row) => ({ date: row.date, value: row.pageviews }))}
                  title="Pageviews"
                  subtitle="Daily views stored for this site"
                  yAxisLabel="Views"
                />
              </div>
            </div>
          )}

          {data.series.length > 0 && (
            <div className="grid items-start gap-5 lg:grid-cols-2">
                <HistogramBar
                  data={data.series.map((row) => ({
                    date: row.date,
                    sessions: row.newUsers,
                    users: row.returningUsers,
                  }))}
                  title="New vs returning"
                  subtitle="New users (blue) against returning users (cyan)"
                  height={200}
                  names={{ sessions: "New users", users: "Returning" }}
                />
              <TrendLine
                data={data.series
                  .filter((row) => row.bounceRate !== null)
                  .map((row) => ({ date: row.date, value: (row.bounceRate ?? 0) * 100 }))}
                title="Bounce rate"
                subtitle="Session-weighted, stored daily"
                color="#e31a1a"
                yAxisLabel="%"
              />
            </div>
          )}

          <div className="grid items-start gap-5 md:grid-cols-3">
            {data.devices.length > 0 && (
              <DonutChart
                data={data.devices}
                title="Device mix"
                subtitle={
                  partialCoverage(shownSum(data.devices), data.totals.sessions, "sessions") ??
                  "Share of sessions"
                }
              />
            )}
            {data.channels.length > 0 && (
              <DonutChart
                data={data.channels}
                title="Channels"
                subtitle={
                  partialCoverage(shownSum(data.channels), data.totals.sessions, "sessions") ??
                  "Default channel group"
                }
              />
            )}
            {data.countries.length > 0 && (
              <DonutChart
                data={data.countries.slice(0, 6)}
                title="Countries"
                subtitle={
                  partialCoverage(
                    data.countries.slice(0, 6).reduce((sum, row) => sum + row.value, 0),
                    data.totals.sessions,
                    "sessions",
                  ) ?? "Where sessions came from"
                }
              />
            )}
          </div>

          <div className="grid items-start gap-5 md:grid-cols-2">
            {(data.operatingSystems ?? []).length > 0 && (
              <DonutChart
                data={data.operatingSystems}
                title="Operating system"
                subtitle={
                  partialCoverage(
                    shownSum(data.operatingSystems),
                    data.totals.sessions,
                    "sessions",
                  ) ?? "Windows, macOS, iOS, Android"
                }
              />
            )}
            {data.topSources.length > 0 && (
              <DonutChart
                data={data.topSources.slice(0, 6).map((row) => ({
                  name: row.key,
                  value: row.sessions,
                }))}
                title="Source / medium"
                subtitle={
                  partialCoverage(
                    data.topSources.slice(0, 6).reduce((sum, row) => sum + row.sessions, 0),
                    data.totals.sessions,
                    "sessions",
                  ) ?? "How people arrived"
                }
              />
            )}
          </div>

          <div className="grid items-start gap-5 lg:grid-cols-2">
            {(data.landingPages ?? []).length > 0 && (
              <HorizontalBars
                data={data.landingPages.map((row) => ({
                  name: row.page_path,
                  value: row.sessions,
                }))}
                title="Landing pages"
                subtitle={
                  partialCoverage(
                    shownSum(
                      data.landingPages.map((row) => ({ value: row.sessions })),
                    ),
                    data.totals.sessions,
                    "sessions",
                  ) ?? "Where sessions started"
                }
              />
            )}
            {data.topPages.length > 0 && (
              <HorizontalBars
                data={data.topPages.map((row) => ({ name: row.page_path, value: row.pageviews }))}
                title="Top pages"
                subtitle={
                  partialCoverage(
                    shownSum(data.topPages.map((row) => ({ value: row.pageviews }))),
                    data.totals.pageviews,
                    "pageviews",
                  ) ?? "Pageviews in this range"
                }
              />
            )}
          </div>

          <div>
            <SubHeading
              title="Landing pages"
              info={withSortHint(
                "The first page of each session. Click a row for that page's details.",
                partialCoverage(
                  data.landingPages.reduce((sum, row) => sum + row.sessions, 0),
                  data.totals.sessions,
                  "sessions",
                ),
              )}
            />
            <SimpleTable
              rows={data.landingPages ?? []}
              empty="No landing pages stored in this range yet."
              {...pageRowProps}
              columns={[
                { header: "Path", cell: (row) => row.page_path, sortValue: (row) => row.page_path },
                {
                  header: "Sessions",
                  align: "right",
                  cell: (row) => formatNumber(row.sessions),
                  sortValue: (row) => row.sessions,
                },
                {
                  header: "Users",
                  align: "right",
                  cell: (row) => formatNumber(row.users),
                  sortValue: (row) => row.users,
                },
                {
                  header: "Bounce",
                  align: "right",
                  cell: (row) => formatPercent(row.bounceRate),
                  sortValue: (row) => row.bounceRate,
                },
                {
                  header: "Engagement",
                  align: "right",
                  cell: (row) => formatPercent(row.engagementRate),
                  sortValue: (row) => row.engagementRate,
                },
                {
                  header: "Duration",
                  align: "right",
                  cell: (row) => formatDuration(row.avgSessionDuration),
                  sortValue: (row) => row.avgSessionDuration,
                },
              ]}
            />
          </div>

          <div>
            <SubHeading
              title="All pages"
              info={withSortHint(
                "Every page viewed, wherever the session started. Click a row for that page's details.",
                partialCoverage(
                  data.topPages.reduce((sum, row) => sum + row.pageviews, 0),
                  data.totals.pageviews,
                  "pageviews",
                ),
              )}
            />
            <SimpleTable
              rows={data.topPages}
              {...pageRowProps}
              columns={[
                { header: "Path", cell: (row) => row.page_path, sortValue: (row) => row.page_path },
                {
                  header: "Views",
                  align: "right",
                  cell: (row) => formatNumber(row.pageviews),
                  sortValue: (row) => row.pageviews,
                },
                {
                  header: "Sessions",
                  align: "right",
                  cell: (row) => formatNumber(row.sessions),
                  sortValue: (row) => row.sessions,
                },
                {
                  header: "Users",
                  align: "right",
                  cell: (row) => formatNumber(row.users),
                  sortValue: (row) => row.users,
                },
                {
                  header: "Bounce",
                  align: "right",
                  cell: (row) => formatPercent(row.bounceRate),
                  sortValue: (row) => row.bounceRate,
                },
                {
                  header: "Engagement",
                  align: "right",
                  cell: (row) => formatPercent(row.engagementRate),
                  sortValue: (row) => row.engagementRate,
                },
                {
                  header: "Time on page",
                  align: "right",
                  cell: (row) => formatDuration(row.avgSessionDuration),
                  sortValue: (row) => row.avgSessionDuration,
                },
              ]}
            />
          </div>

          <div>
            <SubHeading
              title="Source / medium"
              info={withSortHint("Where sessions came from, as GA4 records source and medium.", null)}
            />
            <SimpleTable
              rows={data.topSources}
              empty="No source data stored in this range."
              columns={[
                { header: "Source", cell: (row) => row.source, sortValue: (row) => row.source },
                { header: "Medium", cell: (row) => row.medium, sortValue: (row) => row.medium },
                {
                  header: "Sessions",
                  align: "right",
                  cell: (row) => formatNumber(row.sessions),
                  sortValue: (row) => row.sessions,
                },
                {
                  header: "Users",
                  align: "right",
                  cell: (row) => formatNumber(row.users),
                  sortValue: (row) => row.users,
                },
                {
                  header: "Share",
                  align: "right",
                  cell: (row) =>
                    data.totals.sessions > 0
                      ? formatPercent(row.sessions / data.totals.sessions)
                      : "—",
                  sortValue: (row) => row.sessions,
                },
              ]}
            />
          </div>

          <div>
            <SubHeading
              title="Key events"
              info={[
                "Conversion actions tracked in GA4, broken out by where on the page they fired.",
                data.freshness.note ? `Last pull note: ${data.freshness.note}` : "",
              ].filter(Boolean)}
            />
            {data.keyEvents.some((event) => event.total > 0) ? (
              <div className="grid gap-5 lg:grid-cols-2">
                {data.keyEvents
                  .filter((event) => event.total > 0)
                  .map((event) => (
                    <div
                      key={event.eventKey}
                      className="rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)] p-4"
                    >
                      <p className="mb-3 flex items-baseline justify-between gap-3">
                        <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                          {event.label}
                          <InfoEye
                            text={`How many times ${event.label.toLowerCase()} fired in this range, by placement and page.`}
                          />
                        </span>
                        <span className="text-lg font-bold tabular-nums text-white">
                          {formatNumber(event.total)}
                        </span>
                      </p>
                      <SimpleTable
                        rows={event.byPlacement}
                        columns={[
                          { header: "Placement", cell: (row) => row.placement },
                          { header: "Page", cell: (row) => row.page_path },
                          {
                            header: "Count",
                            align: "right",
                            cell: (row) => formatNumber(row.count),
                            sortValue: (row) => row.count,
                          },
                        ]}
                      />
                    </div>
                  ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--nos-text-muted)]">
                No key events stored in this range.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
