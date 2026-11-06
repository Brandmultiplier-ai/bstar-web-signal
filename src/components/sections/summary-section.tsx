"use client";

import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";

import { useSummary } from "@/lib/hooks";
import {
  DeltaChip,
  FreshnessBadge,
  InsightCard,
  Panel,
  QueryState,
  formatNumber,
  formatRate,
} from "@/components/ui";
import type { MoverSet, SiteSummary, SummaryKpi, SummaryResponse, SummarySection } from "@/lib/api-types";
import type { DateFilter } from "@/store/dashboard-store";

const SECTION_LABELS: Record<SummarySection, string> = {
  ga4: "Analytics",
  gsc: "Search",
  clarity: "Behavior",
  calendly: "Conversions",
  leads: "Leads",
};

export function SummarySection({
  site,
  range,
  onOpen,
  onHover,
}: {
  site: SiteSummary;
  range: DateFilter;
  onOpen: (section: SummarySection) => void;
  onHover?: (section: SummarySection) => void;
}) {
  const { data, isLoading, isFetching, error } = useSummary(site.id, range);

  return (
    <Panel
      refreshing={Boolean(data) && isFetching}
      title="Business summary"
      subtitle={`How ${site.domain} did in this range, against the same number of days just before it. Click any figure to open its report.`}
    >
      {!data ? (
        <QueryState isLoading={isLoading} error={error} />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {site.hasGa4 && <FreshnessBadge source="ga4" freshness={data.freshness.ga4} />}
            {site.hasSearchConsole && <FreshnessBadge source="gsc" freshness={data.freshness.gsc} />}
            {site.hasClarity && <FreshnessBadge source="clarity" freshness={data.freshness.clarity} />}
            <FreshnessBadge source="calendly" freshness={data.freshness.calendly} />
          </div>

          <InsightCard title="In one line" body={periodLine(data)} insight={headline(data.kpis)} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.kpis.map((kpi) => (
              <KpiTile
                key={kpi.id}
                kpi={kpi}
                onOpen={() => onOpen(kpi.section)}
                onHover={onHover ? () => onHover(kpi.section) : undefined}
              />
            ))}
          </div>

          <div>
            <h3 className="mb-1 text-sm font-bold text-white">What changed</h3>
            <p className="mb-4 text-xs text-[var(--nos-text-secondary)]">
              The biggest moves against the previous period, from stored data.
            </p>
            {data.changed ? (
              <div className="grid gap-4 lg:grid-cols-3">
                <MoverCard
                  title="Pages (views)"
                  set={data.changed.pages}
                  onOpen={() => onOpen("ga4")}
                />
                <MoverCard
                  title="Google searches (clicks)"
                  set={data.changed.queries}
                  onOpen={() => onOpen("gsc")}
                />
                <MoverCard
                  title="Traffic channels (visits)"
                  set={data.changed.channels}
                  onOpen={() => onOpen("ga4")}
                />
              </div>
            ) : (
              <p className="text-sm text-[var(--nos-text-muted)]">
                All time has no earlier period to compare with. Pick 7, 28 or 90 days to see movers.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

function KpiTile({
  kpi,
  onOpen,
  onHover,
}: {
  kpi: SummaryKpi;
  onOpen: () => void;
  onHover?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      onMouseEnter={onHover}
      onFocus={onHover}
      className="group flex h-full flex-col justify-between gap-2 rounded-2xl border border-[var(--border)] bg-white/[0.04] px-4 py-3 text-left transition-colors hover:border-[var(--nos-accent-border)] hover:bg-white/[0.07]"
    >
      <span className="flex items-center justify-between gap-2">
        <span className="text-label-caps">{kpi.label}</span>
        <span className="flex items-center gap-1 text-[10px] text-[var(--nos-text-muted)] group-hover:text-white">
          {SECTION_LABELS[kpi.section]}
          <ArrowRight size={11} />
        </span>
      </span>
      {kpi.available ? (
        <>
          <span className="text-2xl font-bold tabular-nums text-white">{formatKpi(kpi, kpi.current)}</span>
          <span className="flex flex-wrap items-baseline gap-x-2">
            <DeltaChip change={kpi.change} goodWhen={kpi.goodWhen} />
            {kpi.previous !== null && (
              <span className="text-[11px] text-[var(--nos-text-muted)]">
                was {formatKpi(kpi, kpi.previous)}
              </span>
            )}
          </span>
        </>
      ) : (
        <>
          <span className="text-2xl font-bold text-[var(--nos-text-muted)]">—</span>
          <span className="text-[11px] leading-snug text-[var(--nos-text-muted)]">{kpi.reason}</span>
        </>
      )}
    </button>
  );
}

function MoverCard({ title, set, onOpen }: { title: string; set: MoverSet; onOpen: () => void }) {
  const empty = set.risers.length === 0 && set.fallers.length === 0;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-label-caps">{title}</p>
        <button
          type="button"
          onClick={onOpen}
          className="flex items-center gap-1 text-[11px] text-[var(--nos-text-muted)] hover:text-white"
        >
          Open <ArrowRight size={11} />
        </button>
      </div>
      {empty ? (
        <p className="text-xs text-[var(--nos-text-muted)]">No change between the two periods.</p>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {set.risers.map((row) => (
            <MoverRow key={`up-${row.key}`} name={row.key} difference={row.difference} />
          ))}
          {set.fallers.map((row) => (
            <MoverRow key={`down-${row.key}`} name={row.key} difference={row.difference} />
          ))}
        </ul>
      )}
    </div>
  );
}

function MoverRow({ name, difference }: { name: string; difference: number }) {
  const up = difference > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <li className="flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2">
        <Icon
          size={13}
          className="shrink-0"
          style={{ color: up ? "var(--nos-positive)" : "var(--nos-negative)" }}
        />
        <span className="truncate text-[var(--nos-text-secondary)]" title={name}>
          {name}
        </span>
      </span>
      <span className="shrink-0 font-semibold tabular-nums text-white">
        {up ? "+" : "−"}
        {formatNumber(Math.abs(Math.round(difference)))}
      </span>
    </li>
  );
}

function formatKpi(kpi: SummaryKpi, value: number): string {
  if (kpi.format === "percent") return formatRate(value);
  if (kpi.format === "position") return value.toFixed(1);
  return formatNumber(Math.round(value));
}

function periodLine(data: SummaryResponse): string {
  if (!data.previous) return `All stored days through ${data.range.end}.`;
  return `${data.range.start} to ${data.range.end}, compared with ${data.previous.start} to ${data.previous.end}.`;
}

/** The single biggest move among the figures an owner watches first. */
function headline(kpis: SummaryKpi[]): string {
  const watched = ["bookings", "sessions", "clicks", "forms", "companies"];
  const moved = kpis
    .filter(
      (kpi): kpi is Extract<SummaryKpi, { available: true }> =>
        kpi.available && kpi.change !== null && watched.includes(kpi.id),
    )
    .sort((a, b) => Math.abs(b.change!) - Math.abs(a.change!));
  const top = moved[0];
  if (!top) {
    const missing = kpis.filter((kpi) => !kpi.available).length;
    return missing > 0
      ? `${missing} figure${missing === 1 ? " is" : "s are"} not available for this range. Each tile says why.`
      : "No earlier period with data to compare against.";
  }
  const direction = top.change! > 0 ? "up" : "down";
  const better = (top.change! > 0) === (top.goodWhen === "up");
  return `${top.label} ${direction} ${Math.abs(top.change! * 100).toFixed(0)}% (${formatKpi(top, top.current)} vs ${formatKpi(top, top.previous!)}). ${
    better ? "That is the strongest improvement in this range." : "That is the biggest drop to look at first."
  }`;
}
