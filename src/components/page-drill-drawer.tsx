"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, ExternalLink, X } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { usePageDetail } from "@/lib/hooks";
import { formatLongDate } from "@/lib/dates";
import { usePageDrillStore } from "@/store/page-drill-store";
import {
  DeltaChip,
  InfoEye,
  PanelSkeleton,
  RankList,
  RefreshBar,
  SubHeading,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRate,
} from "@/components/ui";
import type { PageDetailResponse, SiteSummary } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";

type Delta = PageDetailResponse["kpis"]["views"];

/**
 * Right-hand panel for one page. Reads /api/metrics/page only, which reads
 * stored rows. Recordings live in Clarity, so the panel links out to it.
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
          <PageLinks domain={site.domain} path={path} clarityProjectId={shown?.site.clarityProjectId ?? null} />
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
            <PageBody data={shown} />
          )}
        </div>
      </aside>
    </div>
  );
}

function PageLinks({
  domain,
  path,
  clarityProjectId,
}: {
  domain: string;
  path: string;
  clarityProjectId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const liveUrl = `https://${domain}${path.startsWith("/") ? path : `/${path}`}`;
  const button =
    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-white/5 px-2.5 py-1.5 text-xs text-[var(--nos-text-secondary)] hover:bg-white/10 hover:text-white";

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <a href={liveUrl} target="_blank" rel="noopener noreferrer" className={button}>
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
            await navigator.clipboard.writeText(liveUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            setCopied(false);
          }
        }}
      >
        <Copy size={13} /> {copied ? "Copied" : "Copy page URL"}
      </button>
      {clarityProjectId && (
        <InfoEye text="To watch recordings of this page: open Clarity, go to Recordings, then Filters, then Visited URL, and paste the copied URL. Clarity's export API does not provide recordings, so they cannot be shown here." />
      )}
    </div>
  );
}

function PageBody({ data }: { data: PageDetailResponse }) {
  const { kpis, coverage } = data;
  const ga4Note = ga4Status(data);
  const clarityNote = clarityStatus(data);

  return (
    <>
      <section>
        <SubHeading
          title="Traffic"
          info={[
            "Google Analytics, for this page only, compared with the same number of days just before.",
            "GA4 stores the top 50 pages per day, so a quieter page can be missing on some days. Missing days are left out, never counted as zero.",
          ]}
        />
        {ga4Note && <p className="mb-3 text-xs text-[var(--nos-text-muted)]">{ga4Note}</p>}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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

      {coverage.ga4Days > 0 && <PageTrend daily={data.daily} />}

      <section>
        <SubHeading
          title="Behaviour (Clarity)"
          info="Microsoft Clarity, for this page only. Rates are the share of this page's sessions that showed the behaviour, weighted by sessions."
        />
        {clarityNote && <p className="mb-3 text-xs text-[var(--nos-text-muted)]">{clarityNote}</p>}
        {coverage.clarityDays > 0 && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Tile label="Clarity sessions" value={formatNumber(data.behaviour.sessions)} />
            <Tile label="Scroll depth" value={formatRate(kpis.scrollDepthPct.current)} delta={kpis.scrollDepthPct} tip="Average share of the page scrolled." />
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

      <section>
        <SubHeading title="Traffic sources" info="Where sessions that started on this page came from." />
        {data.sources.available ? (
          <RankList
            title="Source / medium"
            info="Sessions that entered on this page, by source and medium."
            rows={data.sources.rows.map((row) => ({ name: `${row.source} / ${row.medium}`, value: row.sessions }))}
            empty="No sources stored for this page in this range."
          />
        ) : (
          <p className="text-sm text-[var(--nos-text-muted)]">{data.sources.reason}</p>
        )}
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

function Tile({
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

function PageTrend({ daily }: { daily: PageDetailResponse["daily"] }) {
  return (
    <section>
      <SubHeading title="Daily views and sessions" info="Gaps are days with no stored row for this page." />
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer width="100%" height={200}>
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
            <Line type="monotone" dataKey="views" name="Views" stroke="#21d4fd" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
            <Line type="monotone" dataKey="sessions" name="Sessions" stroke="#7551ff" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
