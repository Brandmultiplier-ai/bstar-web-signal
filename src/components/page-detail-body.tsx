"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Copy, ExternalLink } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatLongDate } from "@/lib/dates";
import { sourceLabel } from "@/lib/source-labels";
import { sourceViewHref } from "@/lib/view-links";
import {
  DeltaChip,
  InfoEye,
  RankList,
  SubHeading,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRate,
} from "@/components/ui";
import type { PageDetailResponse } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";

type Delta = PageDetailResponse["kpis"]["views"];

export function liveUrl(domain: string, path: string): string {
  return `https://${domain}${path.startsWith("/") ? path : `/${path}`}`;
}

export function PageLinks({
  domain,
  path,
  clarityProjectId,
}: {
  domain: string;
  path: string;
  clarityProjectId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const url = liveUrl(domain, path);
  const button =
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/5 px-2.5 py-1.5 text-xs text-[var(--nos-text-secondary)] hover:bg-white/10 hover:text-white";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <a href={url} target="_blank" rel="noopener noreferrer" className={button}>
        <ExternalLink size={13} /> Open page
      </a>
      {clarityProjectId && (
        <a
          href={`https://clarity.microsoft.com/projects/view/${encodeURIComponent(clarityProjectId)}/dashboard`}
          target="_blank"
          rel="noopener noreferrer"
          className={button}
        >
          <ExternalLink size={13} /> Open in Clarity
        </a>
      )}
      <button
        type="button"
        className={button}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy size={13} /> {copied ? "Copied" : "Copy page URL"}
      </button>
    </div>
  );
}

export function PageInsights({ insights }: { insights: PageDetailResponse["insights"] }) {
  if (insights.length === 0) return null;
  return (
    <section>
      <SubHeading
        title="In plain English"
        info="Written from the stored numbers below, by fixed rules. Nothing here is a guess about what the page is for."
      />
      <ul className="space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)] px-4 py-3.5">
        {insights.map((row) => (
          <li key={row.text} className="flex gap-2.5 text-sm leading-relaxed text-[var(--nos-text-secondary)]">
            <span
              aria-hidden
              className="mt-2 size-1.5 shrink-0 rounded-full"
              style={{
                background:
                  row.tone === "good" ? "var(--nos-positive)" : row.tone === "bad" ? "var(--nos-negative)" : "var(--nos-accent)",
              }}
            />
            <span>{row.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PageBody({
  data,
  siteSlug,
  range,
  onNavigate,
  wide = false,
}: {
  data: PageDetailResponse;
  siteSlug: string;
  range: DateFilter;
  /** Called when a link leaves this view, so a drawer can close. */
  onNavigate?: () => void;
  wide?: boolean;
}) {
  const { kpis, coverage } = data;
  const ga4Note = ga4Status(data);
  const clarityNote = clarityStatus(data);
  const grid = wide ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" : "grid grid-cols-2 gap-3 sm:grid-cols-3";

  return (
    <>
      <section>
        <SubHeading
          title="Where visitors came from"
          info="Sessions that started on this page, by where the visitor clicked from. Click a source to see everything it sends to the site."
        />
        {data.sources.available ? (
          <SourceList rows={data.sources.rows} siteSlug={siteSlug} range={range} onNavigate={onNavigate} />
        ) : (
          <p className="text-sm text-[var(--nos-text-muted)]">{data.sources.reason}</p>
        )}
      </section>

      <section>
        <SubHeading
          title="Traffic"
          info={[
            "Google Analytics, for this page only, compared with the same number of days just before.",
            "GA4 stores the top 50 pages per day, so a quieter page can be missing on some days. Missing days are left out, never counted as zero.",
          ]}
        />
        {ga4Note && <p className="mb-3 text-xs text-[var(--nos-text-muted)]">{ga4Note}</p>}
        <div className={grid}>
          <Tile label="Views" value={num(kpis.views)} delta={kpis.views} />
          <Tile label="Sessions" value={num(kpis.sessions)} delta={kpis.sessions} />
          <Tile label="Users" value={num(kpis.users)} delta={kpis.users} tip="Summed per day, so a returning person can count more than once." />
          <Tile
            label="Engagement"
            value={formatPercent(kpis.engagementRate.current)}
            delta={kpis.engagementRate}
            tip="Share of sessions with this page that lasted 10+ seconds, viewed 2+ pages, or converted."
          />
          <Tile
            label="Bounce"
            value={formatPercent(kpis.bounceRate.current)}
            delta={kpis.bounceRate}
            goodWhen="down"
            tip="Share of sessions with this page that were not engaged."
          />
          <Tile
            label="Avg session length"
            value={formatDuration(kpis.avgSessionDuration.current)}
            delta={kpis.avgSessionDuration}
            tip="Length of the whole session that included this page, not time on this page alone. See Active time below for the page itself."
          />
          <Tile
            label="Entered here"
            value={num(kpis.landingSessions)}
            delta={kpis.landingSessions}
            tip="Sessions that started on this page."
          />
        </div>
      </section>

      {coverage.ga4Days > 0 && <PageTrend daily={data.daily} height={wide ? 240 : 200} />}

      <section>
        <SubHeading
          title="Behaviour (Clarity)"
          info="Microsoft Clarity, for this page only. Rates are the share of this page's sessions that showed the behaviour, weighted by sessions."
        />
        {clarityNote && <p className="mb-3 text-xs text-[var(--nos-text-muted)]">{clarityNote}</p>}
        {coverage.clarityDays > 0 && (
          <div className={grid}>
            <Tile label="Clarity sessions" value={formatNumber(data.behaviour.sessions)} />
            <Tile
              label="Scroll depth"
              value={formatRate(kpis.scrollDepthPct.current)}
              delta={kpis.scrollDepthPct}
              tip="Average share of the page scrolled. On a short page everyone reaches 100%, so read it with Active time."
            />
            <Tile label="Active time" value={formatDuration(kpis.activeTimeSeconds.current)} delta={kpis.activeTimeSeconds} tip="Average time visitors were actively on this page." />
            <Tile label="Rage clicks" value={formatRate(data.behaviour.rageClickPct)} tip="Sessions with rapid repeated clicks in one spot." />
            <Tile label="Dead clicks" value={formatRate(data.behaviour.deadClickPct)} tip="Sessions with clicks that did nothing." />
            <Tile label="Quick backs" value={formatRate(data.behaviour.quickBackPct)} tip="Sessions that left this page and came straight back." />
            <Tile label="Excessive scroll" value={formatRate(data.behaviour.excessiveScrollPct)} tip="Sessions that scrolled up and down more than expected." />
            <Tile label="JS errors" value={formatRate(data.behaviour.scriptErrorPct)} tip="Sessions with a script error." />
          </div>
        )}
      </section>

      <section>
        <SubHeading title="Conversions on this page" info="GA4 key events that fired on this page, after the existing form_id gate, and anonymous form submissions captured from this page." />
        <div className="grid gap-5 sm:grid-cols-2">
          <RankList
            title="Key events"
            info="GA4 key events by placement."
            rows={data.conversions.map((row) => ({ name: `${row.label} · ${row.placement}`, value: row.count }))}
            empty="No key events from this page in this range."
          />
          {data.forms.available ? (
            <RankList
              title={`Form submissions (${formatNumber(data.forms.submissions)})`}
              info="Form captures whose page URL matches this page, by form."
              rows={data.forms.byForm}
              empty="No form submissions from this page in this range."
            />
          ) : (
            <Unavailable title="Form submissions" reason={data.forms.reason} />
          )}
        </div>
      </section>

      {data.companies.available && data.companies.visits > 0 && (
        <section>
          <RankList
            title="Companies that viewed this page"
            info="Companies RB2B identified on this page. Company names only."
            rows={data.companies.rows.map((row) => ({ name: row.company, value: row.visits }))}
            empty="RB2B saw visits to this page but could not name the companies."
          />
        </section>
      )}
    </>
  );
}

/** Sources by readable name, each linking to that source's own view. */
function SourceList({
  rows,
  siteSlug,
  range,
  onNavigate,
}: {
  rows: Array<{ source: string; medium: string; sessions: number }>;
  siteSlug: string;
  range: DateFilter;
  onNavigate?: () => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-[var(--nos-text-muted)]">No sources stored for this page in this range.</p>;
  const total = rows.reduce((sum, row) => sum + row.sessions, 0);
  const max = Math.max(1, ...rows.map((row) => row.sessions));
  return (
    <ul className="space-y-1">
      {rows.map((row) => {
        const label = sourceLabel(row.source, row.medium);
        return (
          <li key={label.raw}>
            <Link
              href={sourceViewHref(siteSlug, row.source, row.medium, range)}
              onClick={onNavigate}
              className="group -mx-2 block rounded-xl px-2 py-2 hover:bg-white/5"
              title={label.explain}
            >
              <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate">
                  <span className="font-semibold text-white">{label.name}</span>
                  <span className="ml-2 text-[var(--nos-text-muted)]">{label.raw}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 font-semibold tabular-nums text-white">
                  {formatNumber(row.sessions)}
                  <span className="font-normal text-[var(--nos-text-muted)]">
                    {total > 0 ? ` · ${Math.round((row.sessions / total) * 100)}%` : ""}
                  </span>
                  <ChevronRight size={13} className="text-[var(--nos-text-muted)] group-hover:text-white" />
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${(row.sessions / max) * 100}%`, background: "var(--vui-gradient-brand)" }}
                />
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ga4Status(data: PageDetailResponse): string | null {
  if (!data.site.hasGa4) return "Google Analytics is not connected for this site.";
  if (!data.firstStored.ga4) return "No Google Analytics data stored for this site yet.";
  if (data.coverage.ga4Days === 0) {
    return "No Google Analytics rows for this page in this range. Quieter pages can fall outside the top 50 stored per day.";
  }
  if (data.firstStored.ga4 > data.range.start) {
    return `Collecting since ${formatLongDate(data.firstStored.ga4)}.`;
  }
  return null;
}

function clarityStatus(data: PageDetailResponse): string | null {
  if (!data.site.clarityProjectId) return "Clarity is not connected for this site.";
  if (!data.firstStored.clarity) return "Clarity not connected yet: no Clarity data stored for this site.";
  if (data.coverage.clarityDays === 0) return "No Clarity rows for this page in this range.";
  if (data.coverage.clarityDays < data.coverage.days) {
    return `Clarity has data for this page on ${data.coverage.clarityDays} of ${data.coverage.days} days.`;
  }
  return null;
}

function num(delta: Delta): string {
  return delta.current === null ? "—" : formatNumber(Math.round(delta.current));
}

export function Tile({
  label,
  value,
  delta,
  goodWhen = "up",
  tip,
}: {
  label: string;
  value: string;
  delta?: Delta;
  goodWhen?: "up" | "down";
  tip?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)] px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-label-caps">
        <span className="leading-snug">{label}</span>
        {tip && <InfoEye text={tip} />}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums text-white">{value}</p>
      {delta && delta.current !== null && <DeltaChip change={delta.change} goodWhen={goodWhen} />}
    </div>
  );
}

function Unavailable({ title, reason }: { title: string; reason: string }) {
  return (
    <div>
      <SubHeading title={title} />
      <p className="text-sm text-[var(--nos-text-muted)]">{reason}</p>
    </div>
  );
}

export function DailyLines({
  daily,
  lines,
  height,
}: {
  daily: Array<Record<string, string | number | null>>;
  lines: Array<{ key: string; name: string; color: string }>;
  height: number;
}) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={daily} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid strokeDasharray="4 4" stroke="rgba(255,255,255,0.1)" vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
            tickFormatter={(value) => formatLongDate(String(value)).replace(/ \d{4}$/, "")}
            interval="preserveStartEnd"
            minTickGap={24}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            tick={{ fill: "var(--nos-text-secondary)", fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{
              background: "var(--nos-bg-surface)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
            }}
            labelFormatter={(value) => formatLongDate(String(value))}
          />
          {lines.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              strokeWidth={2}
              dot={{ r: 2 }}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function PageTrend({ daily, height }: { daily: PageDetailResponse["daily"]; height: number }) {
  return (
    <section>
      <SubHeading title="Daily views and sessions" info="Gaps are days with no stored row for this page." />
      <DailyLines
        daily={daily}
        height={height}
        lines={[
          { key: "views", name: "Views", color: "#21d4fd" },
          { key: "sessions", name: "Sessions", color: "#7551ff" },
        ]}
      />
    </section>
  );
}
