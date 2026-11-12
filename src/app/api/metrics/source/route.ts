import { NextResponse } from "next/server";

import { previousWindow, type Window } from "@/lib/read/compare";
import { buildSourceDetail } from "@/lib/read/source-detail";
import { parseRange, requireReader, requireSiteId } from "@/lib/read/request";
import { missingRelation, readJson, startTimer } from "@/lib/read/respond";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

const MAX_VALUE_LENGTH = 512;
const NOT_COLLECTED = "Landing pages per source are not collected yet.";

/** One traffic source of one site, from stored GA4 rows. Never calls an external API. */
export async function GET(request: Request) {
  const timer = startTimer();
  const auth = await requireReader();
  if (!auth.ok) return auth.response;
  timer.mark("auth");

  const url = new URL(request.url);
  const siteId = requireSiteId(url);
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  const source = url.searchParams.get("source");
  const medium = url.searchParams.get("medium");
  if (!source || !medium || source.length > MAX_VALUE_LENGTH || medium.length > MAX_VALUE_LENGTH) {
    return NextResponse.json({ error: "source and medium are required" }, { status: 400 });
  }

  const range = parseRange(url);
  const current: Window = { start: range.start, end: range.end };
  const previous = range.allTime ? null : previousWindow(current);
  const span: Window = { start: previous?.start ?? current.start, end: current.end };
  const { supabase } = auth;

  const site = await supabase.from("sites").select("domain").eq("id", siteId).maybeSingle();
  if (site.error) return NextResponse.json({ error: site.error.message }, { status: 500 });
  if (!site.data) return NextResponse.json({ error: "Unknown siteId" }, { status: 404 });

  const [totals, siteDaily, landings, anyLandings] = await Promise.all([
    supabase
      .from("ga4_source_daily")
      .select("date, sessions, users")
      .eq("site_id", siteId)
      .eq("source", source)
      .eq("medium", medium)
      .gte("date", span.start)
      .lte("date", span.end),
    supabase
      .from("ga4_daily")
      .select("date, sessions")
      .eq("site_id", siteId)
      .gte("date", span.start)
      .lte("date", span.end),
    supabase
      .from("ga4_landing_source_daily")
      .select("date, page_path, sessions, users")
      .eq("site_id", siteId)
      .eq("source", source)
      .eq("medium", medium)
      .gte("date", current.start)
      .lte("date", current.end),
    supabase.from("ga4_landing_source_daily").select("date").eq("site_id", siteId).order("date").limit(1),
  ]);
  timer.mark("db");

  const error = totals.error ?? siteDaily.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const landingRows = landings.data ?? [];
  const paths = [...new Set(landingRows.map((row) => row.page_path))];
  const engagement = paths.length
    ? await supabase
        .from("ga4_landing_daily")
        .select("date, page_path, sessions, engaged_sessions, bounce_rate, avg_session_duration")
        .eq("site_id", siteId)
        .in("page_path", paths)
        .gte("date", current.start)
        .lte("date", current.end)
    : { data: [], error: null };
  if (engagement.error) return NextResponse.json({ error: engagement.error.message }, { status: 500 });
  timer.mark("db2");

  const landingsReadable = landings.error
    ? {
        available: false as const,
        reason: missingRelation(landings.error) ? NOT_COLLECTED : `Landing pages could not be read: ${landings.error.message}`,
      }
    : (anyLandings.data ?? []).length === 0
      ? { available: false as const, reason: NOT_COLLECTED }
      : { available: true as const, rows: landingRows };

  const detail = buildSourceDetail({
    source,
    medium,
    current,
    previous,
    totals: totals.data ?? [],
    site: siteDaily.data ?? [],
    landings: landingsReadable,
    engagement: engagement.data ?? [],
  });

  return readJson(
    {
      range,
      previous,
      source,
      medium,
      site: { domain: site.data.domain },
      landingsSince: anyLandings.error ? null : (anyLandings.data?.[0]?.date ?? null),
      ...detail,
    },
    timer,
  );
}
