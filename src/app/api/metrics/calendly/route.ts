import { NextResponse } from "next/server";

import { parseRange, readFreshness, requireReader } from "@/lib/read/request";

export const dynamic = "force-dynamic";

const UNATTRIBUTED = "(none)";

/**
 * Calendly is not split per site: the booking link is shared, so attribution
 * comes from the UTM values on the booking rather than from a domain. Its own
 * view for that reason.
 */
export async function GET(request: Request) {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const range = parseRange(new URL(request.url));
  const { supabase } = auth;

  const [bookings, freshness] = await Promise.all([
    supabase
      .from("calendly_bookings")
      .select("*")
      // scheduled_at is a timestamp and the range is dates, so bound to the
      // whole of the end day rather than its midnight.
      .gte("scheduled_at", `${range.start}T00:00:00Z`)
      .lte("scheduled_at", `${range.end}T23:59:59Z`)
      .order("scheduled_at", { ascending: false }),
    readFreshness(supabase, "calendly"),
  ]);

  if (bookings.error) {
    return NextResponse.json({ error: bookings.error.message }, { status: 500 });
  }

  const rows = bookings.data ?? [];

  // Group by the source/medium/campaign triple, which is the question a
  // founder actually asks of this data: which channel produced the calls.
  const byAttribution = new Map<
    string,
    { source: string; medium: string; campaign: string; bookings: number }
  >();

  for (const row of rows) {
    const source = row.utm_source ?? UNATTRIBUTED;
    const medium = row.utm_medium ?? UNATTRIBUTED;
    const campaign = row.utm_campaign ?? UNATTRIBUTED;
    const key = `${source}|${medium}|${campaign}`;
    const existing = byAttribution.get(key);
    if (existing) existing.bookings += 1;
    else byAttribution.set(key, { source, medium, campaign, bookings: 1 });
  }

  const byDay = new Map<string, number>();
  for (const row of rows) {
    const day = row.scheduled_at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + 1);
  }

  return NextResponse.json({
    range,
    freshness,
    totals: {
      bookings: rows.length,
      attributed: rows.filter((row) => row.utm_source !== null).length,
      cancelled: rows.filter((row) => row.status === "canceled").length,
    },
    series: [...byDay.entries()]
      .map(([date, bookings]) => ({ date, bookings }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byAttribution: [...byAttribution.values()].sort((a, b) => b.bookings - a.bookings),
    bookings: rows.map((row) => ({
      uri: row.calendly_uri,
      eventName: row.event_name,
      status: row.status,
      scheduledAt: row.scheduled_at,
      inviteeName: row.invitee_name,
      utmSource: row.utm_source,
      utmMedium: row.utm_medium,
      utmCampaign: row.utm_campaign,
      utmContent: row.utm_content,
      utmTerm: row.utm_term,
    })),
  });
}
