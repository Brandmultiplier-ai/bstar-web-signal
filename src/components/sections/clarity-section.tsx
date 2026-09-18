"use client";

import { MousePointerClick } from "lucide-react";

import { useClarity } from "@/lib/hooks";
import {
  InsightCard,
  Panel,
  QueryState,
  SimpleTable,
  Stat,
  StatGrid,
  formatDuration,
  formatNumber,
  formatRate,
} from "@/components/ui";
import { DonutChart } from "@/website-signals-kit/components/charts/DonutChart";
import { HistogramBar } from "@/website-signals-kit/components/charts/HistogramBar";
import { HorizontalBars } from "@/website-signals-kit/components/charts/HorizontalBars";
import { TrendLine } from "@/website-signals-kit/components/charts/TrendLine";
import type { SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";
import { CLARITY_METRIC_DEFS, REPORT_BLURBS, SOURCE_WINDOW_NOTES } from "@/lib/summaries";

export function ClaritySection({
  site,
  range,
}: {
  site?: SiteSummary;
  range: DateFilter;
}) {
  const { data, isLoading, error } = useClarity(range, site?.id);

  const hasRage = data?.totals.rageClickPct !== null;
  const hasDead = data?.totals.deadClickPct !== null;
  const hasQuick = data?.totals.quickBackPct !== null;
  const hasJs = data?.totals.scriptErrorPct !== null;
  const hasScroll = data?.totals.scrollDepthPct !== null;
  const hasExcessive = data?.totals.excessiveScrollPct !== null;

  return (
    <Panel
      title="Microsoft Clarity"
      subtitle={
        site
          ? `Pages for ${site.domain}. Date chips re-read stored days — they do not call Clarity.`
          : "Shared project. Date changes read stored days only."
      }
      note={SOURCE_WINDOW_NOTES.clarity}
      source="clarity"
      freshness={data?.freshness}
      icon={MousePointerClick}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">
          <InsightCard
            title="What this report is"
            body={REPORT_BLURBS.clarity}
            insight={
              data.totals.sessions > 0
                ? `${formatNumber(data.totals.sessions)} sessions on stored pages in this window.`
                : "No Clarity pages stored in this window yet. Each successful pull adds one day; older saved days stay."
            }
          />

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
                hint="Time actually interacting with the page"
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
              <DonutChart data={data.devices} title="Device" subtitle="Clarity sessions" />
            )}
            {data.browsers.length > 0 && (
              <DonutChart data={data.browsers} title="Browser" subtitle="Clarity sessions" />
            )}
            {data.operatingSystems.length > 0 && (
              <DonutChart
                data={data.operatingSystems}
                title="Operating system"
                subtitle="Clarity sessions"
              />
            )}
          </div>

          <div className="grid items-start gap-5 md:grid-cols-3">
            {data.sources.length > 0 && (
              <DonutChart data={data.sources} title="Traffic source" subtitle="Clarity source" />
            )}
            {data.countries.length > 0 && (
              <DonutChart
                data={data.countries.slice(0, 8)}
                title="Countries"
                subtitle="Clarity sessions"
              />
            )}
            {data.byHost.length > 1 && (
              <DonutChart data={data.byHost} title="By site" subtitle="Sessions on each host" />
            )}
          </div>

          {data.topPages.length > 0 && (
            <HorizontalBars
              data={data.topPages.map((row) => ({
                name: `${row.host.replace(/^www\./, "")}${row.pagePath}`,
                value: row.sessions,
              }))}
              title="Busiest pages"
              subtitle="Sessions, split by hostname"
              color="#21d4fd"
            />
          )}

          <div>
            <h3 className="mb-2 text-xs font-medium text-[var(--nos-text-muted)]">
              Page behaviour
            </h3>
            <SimpleTable
              rows={data.topPages}
              empty="No Clarity pages stored in this range yet."
              columns={[
                { header: "Host", cell: (row) => row.host },
                { header: "Path", cell: (row) => row.pagePath },
                { header: "Sessions", align: "right", cell: (row) => formatNumber(row.sessions) },
                {
                  header: "Users",
                  align: "right",
                  cell: (row) => formatNumber(row.distinctUsers),
                },
                ...(hasScroll
                  ? [
                      {
                        header: "Scroll",
                        align: "right" as const,
                        cell: (row: (typeof data.topPages)[number]) =>
                          formatRate(row.scrollDepthPct),
                      },
                    ]
                  : []),
                ...(hasExcessive
                  ? [
                      {
                        header: "Excessive",
                        align: "right" as const,
                        cell: (row: (typeof data.topPages)[number]) =>
                          formatRate(row.excessiveScrollPct),
                      },
                    ]
                  : []),
                {
                  header: "Active",
                  align: "right" as const,
                  cell: (row: (typeof data.topPages)[number]) =>
                    formatDuration(row.activeTimeSeconds),
                },
                ...(hasRage
                  ? [
                      {
                        header: "Rage",
                        align: "right" as const,
                        cell: (row: (typeof data.topPages)[number]) =>
                          formatRate(row.rageClickPct),
                      },
                    ]
                  : []),
                ...(hasDead
                  ? [
                      {
                        header: "Dead",
                        align: "right" as const,
                        cell: (row: (typeof data.topPages)[number]) =>
                          formatRate(row.deadClickPct),
                      },
                    ]
                  : []),
                ...(hasQuick
                  ? [
                      {
                        header: "Quick back",
                        align: "right" as const,
                        cell: (row: (typeof data.topPages)[number]) =>
                          formatRate(row.quickBackPct),
                      },
                    ]
                  : []),
                ...(hasJs
                  ? [
                      {
                        header: "JS errors",
                        align: "right" as const,
                        cell: (row: (typeof data.topPages)[number]) =>
                          formatRate(row.scriptErrorPct),
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </div>
      )}
    </Panel>
  );
}
