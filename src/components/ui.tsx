"use client";

import { useMemo, useState } from "react";

import type { IngestSource } from "@/lib/database.types";
import { clarityStatusText, describeFreshness, SOURCE_CHIP, type Freshness } from "@/lib/freshness";
import { SOURCE_LABELS, cadenceLabel } from "@/lib/sources";
import { CardInfoButton } from "@/website-signals-kit/components/CardInfoButton";

export type { Freshness, FreshnessState } from "@/lib/freshness";
export { describeFreshness } from "@/lib/freshness";

export function Panel({
  title,
  subtitle,
  note,
  source,
  freshness,
  icon: Icon,
  refreshing = false,
  info,
  children,
}: {
  title: string;
  /** Subtitle, note and info all live behind the card's eye button. */
  subtitle?: string;
  note?: string;
  info?: string;
  source?: IngestSource;
  freshness?: Freshness;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  /** Previous data stays on screen, dimmed, while the new range or site loads. */
  refreshing?: boolean;
  children: React.ReactNode;
}) {
  const details = [subtitle, note, info].filter(Boolean) as string[];
  return (
    <section className="nos-card relative overflow-hidden" aria-busy={refreshing}>
      {refreshing && <RefreshBar />}
      <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon && (
            <span
              className="vui-tile"
              style={{ background: "var(--vui-gradient-brand)", width: 38, height: 38 }}
            >
              <Icon size={17} strokeWidth={2} />
            </span>
          )}
          <h2 className="text-base font-bold text-white">{title}</h2>
          {details.length > 0 && <InfoEye text={details} />}
        </div>
        {source && <FreshnessBadge source={source} freshness={freshness} />}
      </header>
      <div className="relative">
        <div className={refreshing ? "pointer-events-none blur-[2px]" : undefined}>{children}</div>
        {refreshing && <LoadingScrim label="Updating" />}
      </div>
    </section>
  );
}

/** The one explanation button every card carries. */
export function InfoEye({ text }: { text: string | string[] }) {
  const parts = (Array.isArray(text) ? text : [text]).filter(Boolean);
  if (parts.length === 0) return null;
  return (
    <CardInfoButton
      description={
        parts.length === 1 ? (
          parts[0]
        ) : (
          <div className="space-y-2">
            {parts.map((part) => (
              <p key={part}>{part}</p>
            ))}
          </div>
        )
      }
    />
  );
}

/** A titled block inside a panel. Any explanation sits behind the eye. */
export function SubHeading({ title, info }: { title: string; info?: string | string[] }) {
  return (
    <h3 className="mb-3 flex items-center gap-1.5 text-sm font-bold text-white">
      {title}
      {info && <InfoEye text={info} />}
    </h3>
  );
}

/** One ring. A single transform, so it stays cheap on a large page. */
export function Spinner() {
  return (
    <span
      aria-hidden
      className="inline-block size-8 animate-spin rounded-full border-2 border-white/25 border-t-white"
    />
  );
}

/**
 * Covers whatever is already on screen. The page underneath is blurred by the
 * caller; this adds the dim layer and the spinner.
 */
export function LoadingScrim({ label, fixed = false }: { label: string; fixed?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={
        fixed
          ? "fixed inset-0 z-[80] flex flex-col items-center justify-center gap-3 bg-black/50 backdrop-blur-sm"
          : "absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 rounded-[inherit] bg-black/45"
      }
    >
      <Spinner />
      <p className="text-sm font-medium text-white">{label}</p>
    </div>
  );
}

/** Thin bar on the top edge while a refetch runs behind visible data. */
export function RefreshBar() {
  return (
    <span
      aria-hidden
      className="absolute inset-x-0 top-0 h-0.5"
      style={{ background: "var(--vui-gradient-brand)" }}
    />
  );
}

/**
 * One chip per source. Red when the last run failed or the last success is
 * past that source's cadence. The sentence names the last successful pull
 * and never describes the gap as a zero.
 */
export function FreshnessBadge({
  source,
  freshness,
}: {
  source: IngestSource;
  freshness?: Freshness;
}) {
  // No answer yet is not the same as "never pulled". Stay neutral until the
  // API has said what the last pull was.
  if (!freshness) {
    return (
      <span
        className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[var(--nos-text-muted)]"
        aria-busy="true"
      >
        <span aria-hidden className="inline-block size-1.5 animate-pulse rounded-full bg-white/30" />
        <span className="font-semibold text-white">{SOURCE_CHIP[source]}</span>
        <span>·</span>
        Checking…
      </span>
    );
  }

  const { state, message } = describeFreshness(source, freshness);
  const detail = source === "clarity" ? clarityStatusText(freshness) : null;

  // A null HTTP status is unknown and is not passed in here. Red is a failed
  // or abandoned ingest, a failed cron run, a present non-2xx status (all
  // folded into `failing`), or a source past its cadence (`stale`).
  const color = {
    fresh: "var(--nos-positive)",
    failing: "var(--nos-negative)",
    stale: "var(--nos-negative)",
    never: "var(--nos-negative)",
  }[state];

  return (
    <span
      className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[var(--nos-text-secondary)]"
      title={`${SOURCE_LABELS[source]} · fetched ${cadenceLabel(source)}`}
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        // The glow is what makes the state readable at a glance on the dark
        // canvas; a flat 6px dot disappears against the glass card.
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      <span className="font-semibold text-white">{SOURCE_CHIP[source]}</span>
      <span className="text-[var(--nos-text-muted)]">·</span>
      {detail ? `${message} ${detail}` : message}
    </span>
  );
}

/** Plain definitions for the tiles that do not bring their own. */
const STAT_GLOSSARY: Record<string, string> = {
  Sessions: "Visits to the site. One person can make several sessions.",
  Users: "Distinct people (browsers) who visited in this range.",
  "Unique users": "Distinct people Clarity saw in this range.",
  "New users": "People visiting for the first time in this range.",
  Pageviews: "Every page load, including repeat views of the same page.",
  Engagement: "Share of sessions that lasted 10+ seconds, viewed 2+ pages, or converted.",
  Bounce: "Share of sessions that were not engaged.",
  "Avg. duration": "Average length of a session.",
  Clicks: "Clicks from Google Search results to the site.",
  Impressions: "Times the site appeared in Google Search results.",
  CTR: "Clicks divided by impressions.",
  Companies: "Distinct companies RB2B identified among visitors.",
  "Identified visits": "Visits RB2B matched to a person or company.",
  Submissions: "Form submissions received from the site.",
  "Forms used": "Distinct forms that received at least one submission.",
};

export function StatGrid({ children }: { children: React.ReactNode }) {
  // Same gap as the page-level bento so stat tiles sit on the shared rhythm.
  return <div className="grid grid-cols-2 items-stretch gap-4 sm:grid-cols-4">{children}</div>;
}

export function Stat({
  label,
  value,
  hint,
  tip,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Short definition shown on the info button. */
  tip?: string;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
}) {
  const details = [tip ?? STAT_GLOSSARY[label] ?? label, hint].filter(Boolean) as string[];
  return (
    <div className="flex h-full items-start justify-between gap-2 rounded-2xl border border-[var(--border)] bg-[var(--nos-bg-overlay)] px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-label-caps">
          <span className="whitespace-normal leading-snug">{label}</span>
          <InfoEye text={details} />
        </p>
        <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>
      </div>
      {Icon && (
        <span
          className="vui-tile"
          style={{ background: "var(--vui-gradient-brand)", width: 34, height: 34 }}
        >
          <Icon size={15} strokeWidth={2} />
        </span>
      )}
    </div>
  );
}

export type TableColumn<T> = {
  header: string;
  cell: (row: T) => React.ReactNode;
  align?: "right";
  /** Makes the header a sort toggle. Nulls always sort last. */
  sortValue?: (row: T) => number | string | null;
};

export function SimpleTable<T>({
  rows,
  columns,
  empty = "No data in this range.",
  onRowClick,
  onRowIntent,
  isSelected,
}: {
  rows: T[];
  columns: Array<TableColumn<T>>;
  empty?: string;
  onRowClick?: (row: T) => void;
  /** Hover or press, used to start the read before the click. */
  onRowIntent?: (row: T) => void;
  isSelected?: (row: T) => boolean;
}) {
  const [sort, setSort] = useState<{ header: string; descending: boolean } | null>(null);

  const sorted = useMemo(() => {
    const column = sort && columns.find((item) => item.header === sort.header);
    if (!column?.sortValue) return rows;
    const value = column.sortValue;
    return [...rows].sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      const order =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right));
      return sort!.descending ? -order : order;
    });
  }, [rows, columns, sort]);

  if (rows.length === 0) {
    return <p className="text-sm text-[var(--nos-text-muted)]">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            {columns.map((column) => {
              const active = sort?.header === column.header;
              return (
                <th
                  key={column.header}
                  aria-sort={active ? (sort!.descending ? "descending" : "ascending") : undefined}
                  className={`text-label-caps border-b border-[var(--border)] pb-3 pr-4 ${
                    column.align === "right" ? "text-right" : ""
                  }`}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort(
                          active
                            ? { header: column.header, descending: !sort!.descending }
                            : { header: column.header, descending: true },
                        )
                      }
                      className={`inline-flex items-center gap-1 uppercase hover:text-white ${
                        active ? "text-white" : ""
                      }`}
                    >
                      {column.header}
                      <span aria-hidden className="text-[9px]">
                        {active ? (sort!.descending ? "▼" : "▲") : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, index) => (
            <tr
              key={index}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onPointerEnter={onRowIntent ? () => onRowIntent(row) : undefined}
              onPointerDown={onRowIntent ? () => onRowIntent(row) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              aria-selected={onRowClick ? Boolean(isSelected?.(row)) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.target !== event.currentTarget) return;
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
              className={`border-b border-[var(--border)] transition-colors last:border-0 hover:bg-white/5 ${
                onRowClick ? "cursor-pointer" : ""
              } ${isSelected?.(row) ? "bg-white/[0.07]" : ""}`}
            >
              {columns.map((column) => (
                <td
                  key={column.header}
                  className={`py-3 pr-4 text-[var(--nos-text-secondary)] ${
                    column.align === "right" ? "text-right font-semibold tabular-nums text-white" : ""
                  }`}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Ranked names with a proportional bar. Labels are shown in full, unlike the path-shortening chart. */
export function RankList({
  title,
  rows,
  empty = "Nothing in this range.",
  format = formatNumber,
  info,
}: {
  title: string;
  rows: Array<{ name: string; value: number }>;
  empty?: string;
  format?: (value: number) => string;
  info?: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div>
      <SubHeading title={title} info={info ?? title} />
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--nos-text-muted)]">{empty}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.name} className="text-xs">
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="truncate text-[var(--nos-text-secondary)]" title={row.name}>
                  {row.name}
                </span>
                <span className="shrink-0 font-semibold tabular-nums text-white">{format(row.value)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5">
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${(row.value / max) * 100}%`, background: "var(--vui-gradient-brand)" }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Change against the previous window. Green means better, whichever direction that is. */
export function DeltaChip({
  change,
  goodWhen = "up",
}: {
  change: number | null;
  goodWhen?: "up" | "down";
}) {
  if (change === null || !Number.isFinite(change)) {
    return <span className="text-[11px] text-[var(--nos-text-muted)]">No comparison</span>;
  }
  const flat = Math.abs(change) < 0.005;
  const better = flat ? null : (change > 0) === (goodWhen === "up");
  const color =
    better === null ? "var(--nos-text-muted)" : better ? "var(--nos-positive)" : "var(--nos-negative)";
  const arrow = flat ? "→" : change > 0 ? "▲" : "▼";
  return (
    <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
      {arrow} {flat ? "Flat" : `${Math.abs(change * 100).toFixed(change !== 0 && Math.abs(change) < 0.1 ? 1 : 0)}%`}
      <span className="font-normal text-[var(--nos-text-muted)]"> vs before</span>
    </span>
  );
}

export function QueryState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) {
    return <OpeningState label="Loading" />;
  }
  return (
    <p className="text-sm text-[var(--nos-negative)]">
      {error instanceof Error ? error.message : "Something went wrong."}
    </p>
  );
}

const SKELETON_FILL = {
  background:
    "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(0,117,255,0.08) 50%, rgba(255,255,255,0.04) 100%)",
  backgroundSize: "200% 100%",
  border: "1px solid var(--border)",
} as const;

function Block({ className }: { className: string }) {
  return <div className={`rounded-2xl ${className}`} style={SKELETON_FILL} />;
}

/** Centered spinner for a screen that has nothing to blur yet. */
export function OpeningState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3" role="status" aria-busy="true">
      <Spinner />
      <p className="text-sm text-[var(--nos-text-secondary)]">{label}</p>
    </div>
  );
}

/**
 * Same shape as the report it replaces: KPI tiles, a chart row, then a table.
 * The layout does not jump when data arrives.
 */
export function PanelSkeleton({ tiles = 8, table = true }: { tiles?: number; table?: boolean }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading report">
      <Block className="h-[72px]" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: tiles }, (_, index) => (
          <Block key={index} className="h-[76px]" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <Block className="h-[220px] lg:col-span-3" />
        <Block className="h-[220px] lg:col-span-2" />
      </div>
      {table && (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, index) => (
            <Block key={index} className="h-9" />
          ))}
        </div>
      )}
    </div>
  );
}

export const formatNumber = (value: number) => value.toLocaleString("en-US");
export const formatPercent = (value: number | null, digits = 1) =>
  value === null ? "—" : `${(value * 100).toFixed(digits)}%`;
/** Clarity already reports its rates as percentages, not fractions. */
export const formatRate = (value: number | null, digits = 1) =>
  value === null ? "—" : `${value.toFixed(digits)}%`;
export const formatDuration = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes === 0) return `${rest}s`;
  return `${minutes}m ${rest}s`;
};
