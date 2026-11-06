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
import {
  deliveryFailureAt,
  summarizeRuns,
  type RunRow,
  type SourceFreshness,
} from "@/lib/freshness";
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
 *
 * getClaims verifies the JWT signature locally against the project's
 * published ES256 key, so a read does not wait on a round trip to Supabase
 * Auth. An expired access token is refreshed here, and the new cookies are
 * written on this response, because middleware no longer runs on these routes.
 */
export async function requireReader(): Promise<
  { ok: true; supabase: ReaderClient } | { ok: false; response: NextResponse }
> {
  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
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

const FRESHNESS_SOURCES: IngestSource[] = ["ga4", "gsc", "clarity", "calendly", "rb2b"];
/** Several months of runs for every source. A source with no success in it gets one targeted read. */
const RECENT_RUNS = 400;

const freshnessByClient = new WeakMap<ReaderClient, Promise<Record<IngestSource, SourceFreshness>>>();

/**
 * Every source's freshness from one ingestion_runs read and one delivery RPC,
 * shared by every readFreshness call on the same request.
 */
export function readAllFreshness(
  supabase: ReaderClient,
): Promise<Record<IngestSource, SourceFreshness>> {
  const cached = freshnessByClient.get(supabase);
  if (cached) return cached;

  const pending = (async () => {
    const [runs, delivery] = await Promise.all([
      supabase
        .from("ingestion_runs")
        .select("source, status, started_at, finished_at, error")
        .in("source", FRESHNESS_SOURCES)
        .order("started_at", { ascending: false })
        .limit(RECENT_RUNS),
      deliveryFailures(supabase),
    ]);

    const rows = (runs.data ?? []) as RunRow[];
    const result = {} as Record<IngestSource, SourceFreshness>;
    await Promise.all(
      FRESHNESS_SOURCES.map(async (source) => {
        let sourceRows = rows.filter((row) => row.source === source);
        if (!sourceRows.some((row) => row.status === "success")) {
          const older = await supabase
            .from("ingestion_runs")
            .select("source, status, started_at, finished_at, error")
            .eq("source", source)
            .eq("status", "success")
            .order("started_at", { ascending: false })
            .limit(1);
          sourceRows = [...sourceRows, ...((older.data ?? []) as RunRow[])];
        }
        result[source] = summarizeRuns(sourceRows, delivery.get(source));
      }),
    );
    return result;
  })();

  freshnessByClient.set(supabase, pending);
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
): Promise<SourceFreshness> {
  return (await readAllFreshness(supabase))[source];
}

export function requireSiteId(url: URL): string | null {
  return url.searchParams.get("siteId");
}
