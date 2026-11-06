import { NextResponse } from "next/server";

import {
  ALL_TIME_START,
  addDays,
  clampReadRange,
  inclusiveDays,
  latestCompleteDay,
  todayUtc,
  toDateString,
} from "@/lib/dates";
import { createServerSupabase } from "@/lib/supabase/server";
import type { IngestSource } from "@/lib/database.types";
import { abandonedRunAt, deliveryFailureAt, latestIso } from "@/lib/freshness";
import type { ReaderClient } from "@/lib/supabase/types";

export type ReadRange = { start: string; end: string; allTime?: boolean };

const MAX_RANGE_DAYS = 365;
const DEFAULT_RANGE_DAYS = 28;

/** Parses `?days=`, `?all=1`, or an explicit `?start=&end=` pair. */
export function parseRange(url: URL): ReadRange {
  if (url.searchParams.get("all") === "1") {
    return { start: ALL_TIME_START, end: latestCompleteDay(), allTime: true };
  }

  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  if (start && end) return clampReadRange(start, end, MAX_RANGE_DAYS);

  const requested = Number(url.searchParams.get("days") ?? DEFAULT_RANGE_DAYS);
  const days = Number.isFinite(requested)
    ? Math.min(Math.max(Math.trunc(requested), 1), MAX_RANGE_DAYS)
    : DEFAULT_RANGE_DAYS;

  const endDate = addDays(todayUtc(), -1);
  return {
    start: toDateString(addDays(endDate, -(days - 1))),
    end: toDateString(endDate),
  };
}

/** Inclusive length of a parsed range, used for the previous-period window. */
export function rangeLengthDays(range: ReadRange): number {
  return inclusiveDays(range.start, range.end);
}

/**
 * Every read route runs as the signed-in user so RLS applies. Returns a 401
 * response instead of a client when there is no session.
 */
export async function requireReader(): Promise<
  { ok: true; supabase: ReaderClient } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  return { ok: true, supabase };
}

const deliveryByClient = new WeakMap<ReaderClient, Promise<Map<IngestSource, string>>>();

/**
 * Cron and HTTP failures that never opened an ingestion_runs row. The RPC is
 * added in supabase/migrations/0019_ingest_delivery_status.sql. Until that
 * migration is applied the call errors and this returns an empty map, so the
 * badges still work from ingestion_runs alone.
 */
function deliveryFailures(supabase: ReaderClient): Promise<Map<IngestSource, string>> {
  const cached = deliveryByClient.get(supabase);
  if (cached) return cached;

  const pending = (async () => {
    const map = new Map<IngestSource, string>();
    const { data, error } = await supabase.rpc("ingest_delivery_status");
    if (error || !data) return map;
    for (const row of data) {
      if (
        row.source !== "ga4" &&
        row.source !== "gsc" &&
        row.source !== "clarity" &&
        row.source !== "calendly"
      ) {
        continue;
      }
      const at = deliveryFailureAt(row);
      if (at) map.set(row.source, at);
    }
    return map;
  })();

  deliveryByClient.set(supabase, pending);
  return pending;
}

/**
 * When a source's data was last fetched successfully, and when the latest
 * attempt failed. A cron/HTTP failure, an ingestion error, or a run left
 * open past the HTTP timeout all count. A finished success with no new rows
 * stays a success, so a real zero is not painted as a failed pull.
 */
export async function readFreshness(
  supabase: ReaderClient,
  source: IngestSource,
): Promise<{
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  note: string | null;
  failureMessage: string | null;
}> {
  const [runs, delivery] = await Promise.all([
    supabase
      .from("ingestion_runs")
      .select("status, started_at, finished_at, error")
      .eq("source", source)
      .order("started_at", { ascending: false })
      .limit(200),
    deliveryFailures(supabase),
  ]);

  const rows = runs.data ?? [];
  const success = rows.find((row) => row.status === "success");
  const failure = rows.find((row) => row.status === "error");
  return {
    lastSuccessAt: success?.finished_at ?? null,
    note: success?.error ?? null,
    failureMessage: failure?.error ?? null,
    lastErrorAt: latestIso([
      rows.find((row) => row.status === "error")?.finished_at,
      abandonedRunAt(rows[0]),
      delivery.get(source),
    ]),
  };
}

export function requireSiteId(url: URL): string | null {
  return url.searchParams.get("siteId");
}
