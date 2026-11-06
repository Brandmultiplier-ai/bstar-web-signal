import type { IngestSource } from "@/lib/database.types";
import { daysSince, formatRelative } from "@/lib/dates";
import { SOURCE_CADENCE_DAYS } from "@/lib/sources";

export type Freshness = {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  /** Gate warning stored on the latest successful pull. Not a failure. */
  note?: string | null;
};

export type FreshnessState = "fresh" | "failing" | "stale" | "never";

/** Short names for the per-source status chips. */
export const SOURCE_CHIP: Record<IngestSource, string> = {
  ga4: "GA4",
  gsc: "Search",
  clarity: "Clarity",
  calendly: "Calendly",
  rb2b: "RB2B",
};

export type DeliveryStatus = {
  source: string;
  cron_status: string | null;
  cron_ended_at: string | null;
  http_status: number | null;
  http_timed_out: boolean | null;
  http_at: string | null;
};

/**
 * A null HTTP status is unknown. pg_net drops responses after about six
 * hours, so a missing status must not count as a failure and must not count
 * as a success. Only a cron status of `failed`, or a status that is present
 * and outside 2xx, is a delivery failure.
 */
export function httpStatusIsFailure(status: number | null): boolean {
  return typeof status === "number" && (status < 200 || status >= 300);
}

export function deliveryFailureAt(row: DeliveryStatus): string | null {
  const cronFailed = row.cron_status === "failed";
  const httpFailed = httpStatusIsFailure(row.http_status);
  const stamps = [
    cronFailed ? row.cron_ended_at : null,
    httpFailed ? (row.http_at ?? row.cron_ended_at) : null,
  ].filter((value): value is string => Boolean(value));
  if (stamps.length === 0) return null;
  return stamps.reduce((latest, stamp) => (new Date(stamp) > new Date(latest) ? stamp : latest));
}

/** A run left `running` past the ingest HTTP timeout never wrote success or error. */
const ABANDONED_AFTER_MS = 6 * 60 * 1000;

export function abandonedRunAt(
  latest: { status: string; started_at: string } | undefined,
  now = Date.now(),
): string | null {
  if (!latest || latest.status !== "running") return null;
  if (now - new Date(latest.started_at).getTime() < ABANDONED_AFTER_MS) return null;
  return latest.started_at;
}

export function latestIso(values: Array<string | null | undefined>): string | null {
  const stamps = values.filter((value): value is string => Boolean(value));
  if (stamps.length === 0) return null;
  return stamps.reduce((latest, stamp) => (new Date(stamp) > new Date(latest) ? stamp : latest));
}

/**
 * A failed or skipped pull is never described as a zero. "Late" uses the same
 * cadence as the schedule: Clarity daily, GA4, Search Console and Calendly
 * every 3 days.
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
