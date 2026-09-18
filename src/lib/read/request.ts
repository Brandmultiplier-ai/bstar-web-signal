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

/**
 * When a source's data was last fetched successfully. Shown next to every
 * section so a failed or delayed cron run is visible rather than silently
 * stale. `site_id` is ignored for sources that are not stored per site.
 */
export async function readFreshness(
  supabase: ReaderClient,
  source: IngestSource,
): Promise<{ lastSuccessAt: string | null; lastErrorAt: string | null }> {
  const { data } = await supabase
    .from("ingestion_runs")
    .select("status, finished_at")
    .eq("source", source)
    .not("finished_at", "is", null)
    .order("finished_at", { ascending: false })
    .limit(200);

  const rows = data ?? [];
  return {
    lastSuccessAt: rows.find((row) => row.status === "success")?.finished_at ?? null,
    lastErrorAt: rows.find((row) => row.status === "error")?.finished_at ?? null,
  };
}

export function requireSiteId(url: URL): string | null {
  return url.searchParams.get("siteId");
}
