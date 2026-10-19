"use client";

import { formatRelative, daysSince } from "@/lib/dates";
import { SOURCE_CADENCE_DAYS, SOURCE_LABELS } from "@/lib/sources";
import type { IngestSource } from "@/lib/database.types";
import { CardInfoButton } from "@/website-signals-kit/components/CardInfoButton";

export function Panel({
  title,
  subtitle,
  note,
  source,
  freshness,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  note?: string;
  source?: IngestSource;
  freshness?: Freshness;
  icon?: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <section className="nos-card">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <span
              className="vui-tile"
              style={{ background: "var(--vui-gradient-brand)", width: 42, height: 42 }}
            >
              <Icon size={18} strokeWidth={2} />
            </span>
          )}
          <div>
            <h2 className="text-base font-bold text-white">{title}</h2>
            {subtitle && (
              <p className="mt-0.5 text-xs leading-relaxed text-[var(--nos-text-secondary)]">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {source && <FreshnessBadge source={source} freshness={freshness} />}
      </header>
      {note && <DataNote>{note}</DataNote>}
      {children}
    </section>
  );
}

/** Always-visible window caveat so date chips are not mistaken for live API calls. */
export function DataNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-5 rounded-xl border border-[var(--border)] bg-white/5 px-3.5 py-2.5 text-xs leading-relaxed text-[var(--nos-text-secondary)]">
      {children}
    </p>
  );
}

export type Freshness = { lastSuccessAt: string | null; lastErrorAt: string | null };

export type FreshnessState = "fresh" | "failing" | "stale" | "never";

/**
 * A failed or skipped pull is never described as a zero. "Late" uses the same
 * cadence as the schedule in supabase/migrations/0004_cron.sql.
 */
export function describeFreshness(
  source: IngestSource,
  freshness?: Freshness,
): { state: FreshnessState; message: string } {
  const cadence = SOURCE_CADENCE_DAYS[source];
  const lastSuccess = freshness?.lastSuccessAt ?? null;
  const state: FreshnessState = !lastSuccess
    ? "never"
    : freshness?.lastErrorAt && new Date(freshness.lastErrorAt) > new Date(lastSuccess)
      ? "failing"
      : daysSince(lastSuccess) >= cadence
        ? "stale"
        : "fresh";

  const message = {
    fresh: `Updated ${formatRelative(lastSuccess)}`,
    failing: `Last run failed. Numbers on screen are from ${formatRelative(lastSuccess)}, not a zero for the missing pull.`,
    stale: `Overdue — last success ${formatRelative(lastSuccess)}, expected every ${cadence}d. A missed pull is not a zero.`,
    never: "Never fetched. Empty charts are a missing pull, not a zero.",
  }[state];

  return { state, message };
}

/**
 * The mechanism that makes a failed or delayed cron run visible. Compares the
 * last successful fetch against that source's own cadence, so "late" always
 * means the same thing as the schedule in supabase/migrations/0004_cron.sql.
 */
export function FreshnessBadge({
  source,
  freshness,
}: {
  source: IngestSource;
  freshness?: Freshness;
}) {
  const { state, message } = describeFreshness(source, freshness);
  const cadence = SOURCE_CADENCE_DAYS[source];

  const color = {
    fresh: "var(--nos-positive)",
    failing: "var(--nos-signal-warm)",
    stale: "var(--nos-negative)",
    never: "var(--nos-negative)",
  }[state];

  return (
    <span
      className="flex items-center gap-2 rounded-full border border-[var(--border)] bg-white/5 px-3 py-1.5 text-[11px] font-medium text-[var(--nos-text-secondary)]"
      title={`${SOURCE_LABELS[source]} · fetched every ${cadence} days`}
    >
      <span
        aria-hidden
        className="inline-block size-1.5 rounded-full"
        // The glow is what makes the state readable at a glance on the dark
        // canvas; a flat 6px dot disappears against the glass card.
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      {message}
    </span>
  );
}

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
  return (
    <div className="flex h-full items-start justify-between gap-2 rounded-2xl border border-[var(--border)] bg-white/[0.04] px-4 py-3">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-label-caps">
          <span className="whitespace-normal leading-snug">{label}</span>
          {tip && <CardInfoButton description={tip} />}
        </p>
        <p className="mt-1 text-xl font-bold tabular-nums text-white">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-[var(--nos-text-muted)]">{hint}</p>}
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

export function SimpleTable<T>({
  rows,
  columns,
  empty = "No data in this range.",
}: {
  rows: T[];
  columns: Array<{ header: string; cell: (row: T) => React.ReactNode; align?: "right" }>;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--nos-text-muted)]">{empty}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            {columns.map((column) => (
              <th
                key={column.header}
                className={`text-label-caps border-b border-[var(--border)] pb-3 pr-4 ${
                  column.align === "right" ? "text-right" : ""
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={index}
              className="border-b border-[var(--border)] transition-colors last:border-0 hover:bg-white/5"
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

export function QueryState({ isLoading, error }: { isLoading: boolean; error: unknown }) {
  if (isLoading) {
    return <PanelSkeleton />;
  }
  return (
    <p className="text-sm text-[var(--nos-negative)]">
      {error instanceof Error ? error.message : "Something went wrong."}
    </p>
  );
}

/** Branded pulse that fills the card instead of a tiny corner spinner. */
export function PanelSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading report">
      <div className="flex flex-col items-center gap-3 py-4">
        <span className="relative flex size-11 items-center justify-center">
          <span
            className="absolute inset-0 rounded-full"
            style={{ border: "2px solid var(--nos-accent-border)" }}
          />
          <span
            className="absolute inset-0 animate-spin rounded-full"
            style={{
              border: "2px solid transparent",
              borderTopColor: "var(--nos-accent)",
              borderRightColor: "var(--nos-accent-2)",
            }}
          />
          <span
            className="size-2 rounded-full"
            style={{ background: "var(--vui-gradient-brand)" }}
          />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--nos-text-muted)]">
          Reading stored days
        </span>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            key={index}
            className="h-[76px] animate-pulse rounded-2xl"
            style={{
              background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(0,117,255,0.08) 50%, rgba(255,255,255,0.04) 100%)",
              backgroundSize: "200% 100%",
              border: "1px solid var(--border)",
            }}
          />
        ))}
      </div>
      <div
        className="h-[220px] animate-pulse rounded-2xl"
        style={{
          background: "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(33,212,253,0.08) 50%, rgba(255,255,255,0.04) 100%)",
          backgroundSize: "200% 100%",
          border: "1px solid var(--border)",
        }}
      />
    </div>
  );
}

export function InsightCard({
  title,
  body,
  insight,
}: {
  title: string;
  body: string;
  insight?: string;
}) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{
        background: "var(--vui-gradient-card)",
        border: "1px solid var(--nos-accent-border)",
      }}
    >
      <p
        className="text-label-caps mb-2"
        style={{
          background: "linear-gradient(90deg, var(--nos-accent) 0%, var(--nos-accent-2) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {title}
      </p>
      <p className="text-sm leading-relaxed text-[var(--nos-text-secondary)]">{body}</p>
      {insight && (
        <p className="mt-2 text-sm leading-relaxed text-white">{insight}</p>
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
