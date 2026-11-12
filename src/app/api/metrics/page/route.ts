import { NextResponse } from "next/server";

import { GA4_KEY_EVENTS } from "@/lib/sources";
import { previousWindow, type Window } from "@/lib/read/compare";
import { readCompanyVisits, readFormCaptures } from "@/lib/read/leads";
import { buildPageDetail } from "@/lib/read/page-detail";
import { parseRange, requireReader, requireSiteId } from "@/lib/read/request";
import { readJson, startTimer } from "@/lib/read/respond";
import type { Ga4EventKey } from "@/lib/database.types";

export const dynamic = "force-dynamic";
export const preferredRegion = "hnd1";

const MAX_PATH_LENGTH = 2048;

/** One page of one site, from stored GA4, Clarity, form and RB2B rows. Never calls an external API. */
export async function GET(request: Request) {
  const timer = startTimer();
  const auth = await requireReader();
  if (!auth.ok) return auth.response;
  timer.mark("auth");

  const url = new URL(request.url);
  const siteId = requireSiteId(url);
  if (!siteId) return NextResponse.json({ error: "siteId is required" }, { status: 400 });
  const path = url.searchParams.get("path");
  if (!path || path.length > MAX_PATH_LENGTH) {
    return NextResponse.json({ error: "path is required" }, { status: 400 });
  }

  const range = parseRange(url);
  const current: Window = { start: range.start, end: range.end };
  const previous = range.allTime ? null : previousWindow(current);
  const span: Window = { start: previous?.start ?? current.start, end: current.end };
  const { supabase } = auth;

  const site = await supabase
    .from("sites")
    .select("domain, ga4_property_id, clarity_project_id, rb2b_enabled")
    .eq("id", siteId)
    .maybeSingle();
  if (site.error) return NextResponse.json({ error: site.error.message }, { status: 500 });
  if (!site.data) return NextResponse.json({ error: "Unknown siteId" }, { status: 404 });
  const { domain, ga4_property_id, clarity_project_id, rb2b_enabled } = site.data;

  const [ga4, landings, clarity, keyEvents, firstGa4, firstClarity, forms, visits] = await Promise.all([
    supabase
      .from("ga4_page_daily")
      .select("date, pageviews, sessions, users, engaged_sessions, bounce_rate, avg_session_duration")
      .eq("site_id", siteId)
      .eq("page_path", path)
      .gte("date", span.start)
      .lte("date", span.end),
    supabase
      .from("ga4_landing_daily")
      .select("date, sessions")
      .eq("site_id", siteId)
      .eq("page_path", path)
      .gte("date", span.start)
      .lte("date", span.end),
    supabase
      .from("clarity_page_daily")
      .select(
        "date, sessions, scroll_depth_pct, active_time_seconds, rage_click_pct, dead_click_pct, quick_back_pct, excessive_scroll_pct, script_error_pct",
      )
      .eq("site_id", siteId)
      .eq("page_path", path)
      .gte("date", span.start)
      .lte("date", span.end),
    supabase
      .from("ga4_key_events_daily")
      .select("date, event_key, placement, count")
      .eq("site_id", siteId)
      .eq("page_path", path)
      .gte("date", current.start)
      .lte("date", current.end),
    supabase
      .from("ga4_page_daily")
      .select("date")
      .eq("site_id", siteId)
      .order("date")
      .limit(1),
    supabase
      .from("clarity_page_daily")
      .select("date")
      .eq("site_id", siteId)
      .order("date")
      .limit(1),
    readFormCaptures(supabase, domain, span.start, span.end),
    rb2b_enabled
      ? readCompanyVisits(supabase, siteId, current.start, current.end)
      : Promise.resolve({ available: false as const, reason: "RB2B is not enabled for this site." }),
  ]);
  timer.mark("db");

  const error = ga4.error ?? landings.error ?? clarity.error ?? keyEvents.error ?? firstGa4.error ?? firstClarity.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const detail = buildPageDetail({
    path,
    current,
    previous,
    ga4: ga4.data ?? [],
    landings: landings.data ?? [],
    clarity: clarity.data ?? [],
    keyEvents: keyEvents.data ?? [],
    sources: { available: false, reason: "Traffic sources per page are not collected yet." },
    forms,
    visits,
  });

  return readJson(
    {
      range,
      previous,
      path,
      site: {
        domain,
        hasGa4: ga4_property_id !== null,
        clarityProjectId: clarity_project_id,
      },
      firstStored: {
        ga4: firstGa4.data?.[0]?.date ?? null,
        clarity: firstClarity.data?.[0]?.date ?? null,
      },
      ...detail,
      conversions: detail.conversions.map((row) => ({
        ...row,
        label: GA4_KEY_EVENTS[row.eventKey as Ga4EventKey]?.label ?? row.eventKey,
      })),
    },
    timer,
  );
}
