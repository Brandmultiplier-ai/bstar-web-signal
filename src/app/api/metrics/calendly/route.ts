import { NextResponse } from "next/server";

import {
  classifyBookings,
  inCountedRange,
  isAttributionGap,
  isHeadline,
  type ClassifiedBooking,
  type ConversionClass,
} from "@/lib/calendly-taxonomy";
import { parseRange, readFreshness, requireReader } from "@/lib/read/request";

export const dynamic = "force-dynamic";

const UNATTRIBUTED = "(none)";

function countClass(rows: ClassifiedBooking[], conversionClass: ConversionClass): number {
  return rows.filter((row) => isHeadline(row) && row.conversionClass === conversionClass).length;
}

/**
 * Calendly is account-wide. Counts follow the conversion taxonomy: Primary,
 * Partner, and Founder-relayed are separate, exclusions never enter them, and
 * a reschedule counts once on the original creation date.
 */
export async function GET(request: Request) {
  const auth = await requireReader();
  if (!auth.ok) return auth.response;

  const range = parseRange(new URL(request.url));
  const { supabase } = auth;

  const [bookings, freshness] = await Promise.all([
    supabase.from("calendly_bookings").select("*"),
    readFreshness(supabase, "calendly"),
  ]);

  if (bookings.error) {
    return NextResponse.json({ error: bookings.error.message }, { status: 500 });
  }

  const inRange = classifyBookings(bookings.data ?? []).filter(
    (row) => !row.superseded && inCountedRange(row, range.start, range.end),
  );

  const headline = inRange.filter(isHeadline);
  const cancelled = inRange.filter(
    (row) => row.cancellation && row.conversionClass !== "excluded",
  );
  const excluded = inRange.filter((row) => row.conversionClass === "excluded");

  const byAttribution = new Map<
    string,
    { source: string; medium: string; campaign: string; bookings: number }
  >();
  for (const row of headline) {
    if (row.conversionClass === "relay") continue;
    const source = row.utm_source ?? UNATTRIBUTED;
    const medium = row.utm_medium ?? UNATTRIBUTED;
    const campaign = row.utm_campaign ?? UNATTRIBUTED;
    const key = `${source}|${medium}|${campaign}`;
    const existing = byAttribution.get(key);
    if (existing) existing.bookings += 1;
    else byAttribution.set(key, { source, medium, campaign, bookings: 1 });
  }

  const byProperty = new Map<string, number>();
  for (const row of headline) {
    if (row.conversionClass !== "primary" || !row.property) continue;
    byProperty.set(row.property, (byProperty.get(row.property) ?? 0) + 1);
  }

  const byExclusion = new Map<string, { reason: string; eventName: string; bookings: number }>();
  for (const row of excluded) {
    const reason = row.exclusionReason ?? "outside-taxonomy";
    const eventName = row.event_name ?? "(unnamed)";
    const key = `${reason}|${eventName}`;
    const existing = byExclusion.get(key);
    if (existing) existing.bookings += 1;
    else byExclusion.set(key, { reason, eventName, bookings: 1 });
  }

  const byDay = new Map<string, number>();
  for (const row of headline) {
    byDay.set(row.countedOn, (byDay.get(row.countedOn) ?? 0) + 1);
  }

  const toList = (row: ClassifiedBooking) => ({
    uri: row.calendly_uri,
    eventName: row.event_name,
    eventSlug: row.event_slug ?? null,
    conversionClass: row.conversionClass,
    property: row.property,
    exclusionReason: row.exclusionReason,
    status: row.cancellation ? "canceled" : (row.status ?? "active"),
    countedOn: row.countedOn,
    scheduledAt: row.scheduled_at,
    inviteeName: row.invitee_name,
    utmSource: row.utm_source,
    utmMedium: row.utm_medium,
    utmCampaign: row.utm_campaign,
    utmContent: row.utm_content,
  });

  return NextResponse.json({
    range,
    freshness,
    totals: {
      primary: countClass(inRange, "primary"),
      partner: countClass(inRange, "partner"),
      relay: countClass(inRange, "relay"),
      cancelled: cancelled.length,
      excluded: excluded.length,
      attributionGaps: inRange.filter(isAttributionGap).length,
    },
    byProperty: [...byProperty.entries()]
      .map(([property, bookings]) => ({ property, bookings }))
      .sort((a, b) => b.bookings - a.bookings),
    series: [...byDay.entries()]
      .map(([date, bookings]) => ({ date, bookings }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    byAttribution: [...byAttribution.values()].sort((a, b) => b.bookings - a.bookings),
    byExclusion: [...byExclusion.values()].sort((a, b) => b.bookings - a.bookings),
    bookings: [...headline, ...cancelled]
      .sort((a, b) => b.countedOn.localeCompare(a.countedOn))
      .map(toList),
  });
}
