"use client";

import { useState } from "react";
import { Search } from "lucide-react";

import { useGsc } from "@/lib/hooks";
import {
  InsightCard,
  Panel,
  QueryState,
  RankList,
  SimpleTable,
  Stat,
  StatGrid,
  formatNumber,
  formatPercent,
} from "@/components/ui";
import { HistogramBar } from "@/website-signals-kit/components/charts/HistogramBar";
import { TrendLine } from "@/website-signals-kit/components/charts/TrendLine";
import type { SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";
import { REPORT_BLURBS, SOURCE_WINDOW_NOTES } from "@/lib/summaries";

const SERVICE_ACCOUNT = "n8n-analytics-ga4@bstar-ga4-analytics.iam.gserviceaccount.com";

export function GscSection({ site, range }: { site: SiteSummary; range: DateFilter }) {
  const { data, isLoading, isFetching, error } = useGsc(site.id, range);
  const empty = data && data.totals.clicks === 0 && data.totals.impressions === 0;
  const [selectedQuery, setSelectedQuery] = useState<string | null>(null);
  const queryDetail = data?.topQueries.find((row) => row.query === selectedQuery) ?? null;

  return (
    <Panel
      refreshing={Boolean(data) && isFetching}
      title="Search Console"
      subtitle={`Organic search for ${site.domain}. Date changes re-read stored days — they never call Google.`}
      note={SOURCE_WINDOW_NOTES.gsc}
      source="gsc"
      freshness={data?.freshness}
      icon={Search}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">
          <InsightCard
            title="What this report is"
            body={REPORT_BLURBS.gsc}
            insight={
              empty
                ? "Nothing stored yet. Search Console API is not writing rows for this property."
                : `${formatNumber(data.totals.clicks)} clicks from ${formatNumber(data.totals.impressions)} impressions.`
            }
          />

          {empty && <GscSetupCard site={site} />}

          {!empty && (
            <>
              <StatGrid>
                <Stat label="Clicks" value={formatNumber(data.totals.clicks)} />
                <Stat label="Impressions" value={formatNumber(data.totals.impressions)} />
                <Stat label="CTR" value={formatPercent(data.totals.ctr, 2)} />
                <Stat
                  label="Avg position"
                  value={data.totals.avgPosition.toFixed(1)}
                  hint="Impression-weighted"
                />
              </StatGrid>

              {data.series.length > 0 && (
                <div className="grid items-start gap-5 lg:grid-cols-5">
                  <div className="lg:col-span-3">
                    <HistogramBar
                      data={data.series.map((row) => ({
                        date: row.date,
                        sessions: row.clicks,
                        users: row.impressions,
                      }))}
                      title="Clicks vs impressions"
                      subtitle="Blue is clicks, cyan is impressions"
                      names={{ sessions: "Clicks", users: "Impressions" }}
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <TrendLine
                      data={data.series.map((row) => ({
                        date: row.date,
                        value: row.avg_position,
                      }))}
                      title="Average position"
                      subtitle="Lower is better"
                      yAxisLabel="Pos"
                    />
                  </div>
                </div>
              )}

              <StatGrid>
                <Stat
                  label="Indexed pages"
                  value={data.indexStatus ? formatNumber(data.indexStatus.indexed) : "—"}
                  hint={
                    data.indexStatus
                      ? `As of ${data.indexStatus.observedOn}`
                      : "No coverage snapshot stored"
                  }
                />
                <Stat
                  label="Not indexed"
                  value={data.indexStatus ? formatNumber(data.indexStatus.notIndexed) : "—"}
                  hint="Submitted but not indexed"
                />
              </StatGrid>

              <div className="grid items-start gap-5 lg:grid-cols-5">
                <div className="lg:col-span-3">
                  {data.indexTrend.length > 1 ? (
                    <HistogramBar
                      data={data.indexTrend.map((row) => ({
                        date: row.date,
                        sessions: row.indexed,
                        users: row.notIndexed,
                      }))}
                      title="Index coverage over time"
                      subtitle="Snapshots stored in this range"
                      names={{ sessions: "Indexed", users: "Not indexed" }}
                    />
                  ) : (
                    <p className="text-xs text-[var(--nos-text-muted)]">
                      {data.indexTrend.length === 1
                        ? "One coverage snapshot in this range, so there is no trend yet."
                        : "No coverage snapshots in this range."}
                    </p>
                  )}
                </div>
                <div className="lg:col-span-2">
                  <RankList
                    title="Clicks by ranking position"
                    rows={data.positionBands.map((row) => ({
                      name: `${row.band} · ${formatNumber(row.queries)} queries`,
                      value: row.clicks,
                    }))}
                  />
                </div>
              </div>

              <div>
                <h3 className="mb-2 text-xs font-medium text-[var(--nos-text-muted)]">
                  Queries, click-earning first
                </h3>
                <p className="mb-2 text-[11px] leading-relaxed text-[var(--nos-text-muted)]">
                  {data.queryCoverage.clicksInTable === data.queryCoverage.clicksTotal
                    ? `These queries account for all ${formatNumber(data.queryCoverage.clicksTotal)} clicks in this range.`
                    : `These stored queries account for ${formatNumber(data.queryCoverage.clicksInTable)} of ${formatNumber(data.queryCoverage.clicksTotal)} clicks. The daily total includes queries that were not kept. This list is not a full breakdown.`}
                </p>
                <SimpleTable
                  rows={data.topQueries}
                  empty="No queries stored in this range."
                  onRowClick={(row) => setSelectedQuery(row.query === selectedQuery ? null : row.query)}
                  isSelected={(row) => row.query === selectedQuery}
                  columns={[
                    { header: "Query", cell: (row) => row.query, sortValue: (row) => row.query },
                    {
                      header: "Clicks",
                      align: "right",
                      cell: (row) => formatNumber(row.clicks),
                      sortValue: (row) => row.clicks,
                    },
                    {
                      header: "Impr.",
                      align: "right",
                      cell: (row) => formatNumber(row.impressions),
                      sortValue: (row) => row.impressions,
                    },
                    {
                      header: "CTR",
                      align: "right",
                      cell: (row) => formatPercent(row.ctr, 1),
                      sortValue: (row) => row.ctr,
                    },
                    {
                      header: "Position",
                      align: "right",
                      cell: (row) => row.avgPosition.toFixed(1),
                      sortValue: (row) => row.avgPosition,
                    },
                  ]}
                />
                <p className="mt-2 text-[11px] text-[var(--nos-text-muted)]">
                  Click a query to see its clicks and impressions day by day.
                </p>
              </div>

              {queryDetail && (
                <div className="rounded-2xl border border-[var(--nos-accent-border)] p-4">
                  <HistogramBar
                    data={queryDetail.daily.map((row) => ({
                      date: row.date,
                      sessions: row.clicks,
                      users: row.impressions,
                    }))}
                    title={`“${queryDetail.query}”`}
                    subtitle={`${formatNumber(queryDetail.clicks)} clicks, ${formatNumber(queryDetail.impressions)} impressions, average position ${queryDetail.avgPosition.toFixed(1)}`}
                    names={{ sessions: "Clicks", users: "Impressions" }}
                    height={200}
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function GscSetupCard({ site }: { site: SiteSummary }) {
  return (
    <div
      className="space-y-3 rounded-2xl p-4 text-sm leading-relaxed text-[var(--nos-text-secondary)]"
      style={{ border: "1px solid var(--nos-accent-border)" }}
    >
      <p className="font-semibold text-white">To start storing Search Console</p>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          In Google Cloud, enable <span className="text-white">Search Console API</span> on the
          project that owns the service account (bstar-ga4-analytics).
        </li>
        <li>
          In Search Console → Settings → Users, add{" "}
          <span className="break-all text-white">{SERVICE_ACCOUNT}</span> as a user.
        </li>
        <li>
          Send the exact property name as it appears in Search Console. Domain properties look
          like <span className="text-white">sc-domain:{site.domain}</span>. URL-prefix properties
          look like <span className="text-white">https://{site.domain}/</span> — scheme, host, and
          trailing slash must match exactly.
        </li>
      </ol>
      <p>
        Once those three are in place, the next ingest writes clicks, impressions, and queries
        into the database. Date chips will then filter those stored days.
      </p>
    </div>
  );
}
