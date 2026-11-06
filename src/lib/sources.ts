import type { Ga4EventKey, IngestSource } from "@/lib/database.types";

/**
 * Cadence per source, in days. These must match the pg_cron schedules in
 * supabase/migrations/0021_platform_cadence.sql, because they set the
 * staleness threshold on the freshness badges.
 */
export const SOURCE_CADENCE_DAYS: Record<IngestSource, number> = {
  clarity: 1,
  ga4: 1,
  gsc: 1,
  calendly: 0.5,
  rb2b: 7,
};

/** "every 12 hours", "daily", "every 7 days". */
export function cadenceLabel(source: IngestSource): string {
  const days = SOURCE_CADENCE_DAYS[source];
  if (days < 1) return `every ${Math.round(days * 24)} hours`;
  if (days === 1) return "daily";
  return `every ${days} days`;
}

export const SOURCE_LABELS: Record<IngestSource, string> = {
  ga4: "Google Analytics 4",
  gsc: "Search Console",
  clarity: "Microsoft Clarity",
  calendly: "Calendly",
  rb2b: "RB2B",
};

export const SCHEDULED_SOURCES = ["ga4", "gsc", "clarity", "calendly"] as const;
export type ScheduledSource = (typeof SCHEDULED_SOURCES)[number];

export function isScheduledSource(value: string): value is ScheduledSource {
  return (SCHEDULED_SOURCES as readonly string[]).includes(value);
}

/**
 * How far back each scheduled pull reaches. The lookback is longer than the
 * cadence so a single missed run self-heals on the next one; overlap is free
 * because every write is a keyed upsert. Historical rows are never deleted.
 *
 * Clarity cannot backfill: its API only returns yesterday. We therefore pull
 * one day at a time, daily, and keep every stored day forever so 7d / 28d /
 * All time can grow as ingest succeeds.
 */
export const SOURCE_LOOKBACK_DAYS: Record<ScheduledSource, number> = {
  ga4: 10,
  gsc: 10,
  calendly: 10,
  clarity: 1,
};

/** Used when a fact table is still sparse so the first successful ingest fills All time. */
export const SOURCE_INITIAL_LOOKBACK_DAYS: Record<ScheduledSource, number> = {
  ga4: 480,
  gsc: 480,
  calendly: 480,
  clarity: 1,
};

/**
 * Our stable internal key for each key event, mapped to the literal GA4
 * `eventName` string.
 *
 * TODO: confirm these against the live GA4 property. The brief described the
 * events in prose, not by their exact event names, and a mismatch here fails
 * silently as a zero rather than as an error.
 */
export const GA4_KEY_EVENTS: Record<Ga4EventKey, { gaEventName: string; label: string }> = {
  calendly_outbound_click: {
    gaEventName: "calendly_outbound_click",
    label: "Calendly outbound click",
  },
  form_submission: { gaEventName: "form_submit", label: "Form submission" },
  calculator_completion: {
    gaEventName: "calculator_completion",
    label: "Calculator completion",
  },
  gate_open: { gaEventName: "gate_open", label: "Gate open" },
  vsl_play: { gaEventName: "vsl_play", label: "VSL play" },
};

/** Reverse lookup used when folding a GA4 response back into our keys. */
export const GA4_EVENT_NAME_TO_KEY: Record<string, Ga4EventKey> = Object.fromEntries(
  Object.entries(GA4_KEY_EVENTS).map(([key, { gaEventName }]) => [gaEventName, key]),
) as Record<string, Ga4EventKey>;

/**
 * Custom GA4 event-scoped dimension holding the on-page placement of a key
 * event (for example "hero", "footer", "mid-article").
 *
 * TODO: confirm the parameter name in the property. If it does not exist, GA4
 * returns "(not set)" for every row rather than erroring.
 */
export const GA4_PLACEMENT_DIMENSION = "customEvent:placement";

/**
 * Event-scoped custom dimension for the form that fired `form_submit`.
 * GA4's Data API name is `customEvent:` plus the parameter name. The pull
 * must request this dimension to drop rows where it is empty: a filter on a
 * field that is not in the response would also hide every other key event
 * that does not send form_id.
 */
export const GA4_FORM_ID_DIMENSION = "customEvent:form_id";
