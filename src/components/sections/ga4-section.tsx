"use client";

import { BarChart3 } from "lucide-react";

import { useGa4 } from "@/lib/hooks";
import {
  InsightCard,
  Panel,
  QueryState,
  SimpleTable,
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
import { REPORT_BLURBS, SOURCE_WINDOW_NOTES } from "@/lib/summaries";

export function Ga4Section({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const { data, isLoading, error } = useGa4(site.id, range);

  return (
    <Panel
      title="Google Analytics"
      subtitle={`Stored traffic for ${site.domain}. Date chips re-read these tables — they never call Google.`}
      note={SOURCE_WINDOW_NOTES.ga4}
      source="ga4"
      freshness={data?.freshness}
      icon={BarChart3}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">
          <InsightCard
            title="What this report is"
            body={REPORT_BLURBS.ga4}
            insight={
              data.totals.sessions > 0
                ? `${formatNumber(data.totals.sessions)} sessions · ${formatPercent(data.totals.bounceRate)} bounced · top landing ${data.landingPages[0]?.page_path ?? "—"}.`
                : "No stored sessions in this window yet."
            }
          />
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
              <DonutChart data={data.devices} title="Device mix" subtitle="Share of sessions" />
            )}
            {data.channels.length > 0 && (
              <DonutChart data={data.channels} title="Channels" subtitle="Default channel group" />
            )}
            {data.countries.length > 0 && (
              <DonutChart
                data={data.countries.slice(0, 6)}
                title="Countries"
                subtitle="Where sessions came from"
              />
            )}
          </div>

          <div className="grid items-start gap-5 md:grid-cols-2">
            {(data.operatingSystems ?? []).length > 0 && (
              <DonutChart
                data={data.operatingSystems.slice(0, 8)}
                title="Operating system"
                subtitle="Windows, macOS, iOS, Android"
              />
            )}
            {data.topSources.length > 0 && (
              <DonutChart
                data={data.topSources.slice(0, 6).map((row) => ({
                  name: row.key,
                  value: row.sessions,
                }))}
                title="Source / medium"
                subtitle="How people arrived"
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
                subtitle="Where sessions started"
              />
            )}
            {data.topPages.length > 0 && (
              <HorizontalBars
                data={data.topPages.map((row) => ({ name: row.page_path, value: row.pageviews }))}
                title="Top pages"
                subtitle="Pageviews in this range"
              />
            )}
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium text-[var(--nos-text-muted)]">
              Landing page detail
            </h3>
            <SimpleTable
              rows={data.landingPages ?? []}
              empty="No landing pages stored in this range yet."
              columns={[
                { header: "Path", cell: (row) => row.page_path },
                { header: "Sessions", align: "right", cell: (row) => formatNumber(row.sessions) },
                { header: "Users", align: "right", cell: (row) => formatNumber(row.users) },
                {
                  header: "Bounce",
                  align: "right",
                  cell: (row) => formatPercent(row.bounceRate),
                },
                {
                  header: "Engagement",
                  align: "right",
                  cell: (row) => formatPercent(row.engagementRate),
                },
                {
                  header: "Duration",
                  align: "right",
                  cell: (row) => formatDuration(row.avgSessionDuration),
                },
              ]}
            />
          </div>

          <div>
            <h3 className="mb-2 text-xs font-medium text-[var(--nos-text-muted)]">Page detail</h3>
            <SimpleTable
              rows={data.topPages}
              columns={[
                { header: "Path", cell: (row) => row.page_path },
                { header: "Views", align: "right", cell: (row) => formatNumber(row.pageviews) },
                { header: "Sessions", align: "right", cell: (row) => formatNumber(row.sessions) },
                { header: "Users", align: "right", cell: (row) => formatNumber(row.users) },
                {
                  header: "Bounce",
                  align: "right",
                  cell: (row) => formatPercent(row.bounceRate),
                },
                {
                  header: "Engagement",
                  align: "right",
                  cell: (row) => formatPercent(row.engagementRate),
                },
                {
                  header: "Time on page",
                  align: "right",
                  cell: (row) => formatDuration(row.avgSessionDuration),
                },
              ]}
            />
          </div>

          {data.keyEvents.some((event) => event.total > 0) && (
            <div>
              <h3 className="mb-2 text-xs font-medium text-[var(--nos-text-muted)]">Key events</h3>
              <SimpleTable
                rows={data.keyEvents.filter((event) => event.total > 0)}
                columns={[
                  { header: "Event", cell: (row) => row.label },
                  { header: "Count", align: "right", cell: (row) => formatNumber(row.total) },
                  {
                    header: "Top placement",
                    cell: (row) => row.byPlacement[0]?.key ?? "—",
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
