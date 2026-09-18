"use client";

import { Search } from "lucide-react";

import { useGsc } from "@/lib/hooks";
import {
  InsightCard,
  Panel,
  QueryState,
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
  const { data, isLoading, error } = useGsc(site.id, range);
  const empty = data && data.totals.clicks === 0 && data.totals.impressions === 0;

  return (
    <Panel
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

              <div>
                <h3 className="mb-2 text-xs font-medium text-[var(--nos-text-muted)]">
                  Top queries
                </h3>
                <SimpleTable
                  rows={data.topQueries}
                  empty="No queries stored in this range."
                  columns={[
                    { header: "Query", cell: (row) => row.query },
                    { header: "Clicks", align: "right", cell: (row) => formatNumber(row.clicks) },
                    {
                      header: "Impr.",
                      align: "right",
                      cell: (row) => formatNumber(row.impressions),
                    },
                    { header: "CTR", align: "right", cell: (row) => formatPercent(row.ctr, 1) },
                    {
                      header: "Position",
                      align: "right",
                      cell: (row) => row.avgPosition.toFixed(1),
                    },
                  ]}
                />
              </div>
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
