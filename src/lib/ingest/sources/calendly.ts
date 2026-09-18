import {
  fetchCurrentUser,
  fetchInvitees,
  fetchScheduledEvents,
  type CalendlyEvent,
  type CalendlyInvitee,
} from "@/lib/clients/calendly";
import { addDays, todayUtc } from "@/lib/dates";
import { upsertRows } from "@/lib/ingest/upsert";
import type { Ingestor, IngestResult } from "@/lib/ingest/types";
import type { CalendlyBooking } from "@/lib/database.types";

/**
 * Bookings are upserted by Calendly URI and kept. Date chips only filter
 * stored rows — they never call Calendly live.
 *
 * How far ahead to pull. Bookings are useful before they happen, so unlike
 * the other sources this one reaches into the future as well as the past.
 */
const FORWARD_DAYS = 120;

/** Concurrency for the per-event invitee calls, kept low to stay clear of
 * Calendly's rate limits on a large backlog. */
const INVITEE_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function toBooking(event: CalendlyEvent, invitee: CalendlyInvitee | undefined): CalendlyBooking {
  const tracking = invitee?.tracking ?? null;
  return {
    calendly_uri: event.uri,
    event_name: event.name,
    status: event.status,
    scheduled_at: event.start_time,
    ended_at: event.end_time,
    booked_at: invitee?.created_at ?? event.created_at,
    invitee_name: invitee?.name ?? null,
    invitee_email: invitee?.email ?? null,
    utm_source: tracking?.utm_source ?? null,
    utm_medium: tracking?.utm_medium ?? null,
    utm_campaign: tracking?.utm_campaign ?? null,
    utm_content: tracking?.utm_content ?? null,
    utm_term: tracking?.utm_term ?? null,
    synced_at: new Date().toISOString(),
  };
}

export const calendlyIngestor: Ingestor = {
  source: "calendly",
  async run(ctx): Promise<IngestResult> {
    const user = await fetchCurrentUser();

    // The shared ingest window is a backward-looking date range; Calendly
    // needs timestamps and we also want everything upcoming.
    const minStartTime = new Date(`${ctx.window.start}T00:00:00Z`).toISOString();
    const maxStartTime = addDays(todayUtc(), FORWARD_DAYS).toISOString();

    const events = (
      await Promise.all([
        fetchScheduledEvents({
          organization: user.current_organization,
          minStartTime,
          maxStartTime,
          status: "active",
        }),
        fetchScheduledEvents({
          organization: user.current_organization,
          minStartTime,
          maxStartTime,
          status: "canceled",
        }),
      ])
    ).flat();

    // One invitee call per booking. A failure here would lose the whole run's
    // bookings over one bad record, so an individual failure degrades to a
    // booking with no UTM attribution instead.
    const inviteeLists = await mapWithConcurrency(events, INVITEE_CONCURRENCY, async (event) => {
      try {
        return await fetchInvitees(event.uri);
      } catch {
        return [] as CalendlyInvitee[];
      }
    });

    const bookings = events.map((event, index) => toBooking(event, inviteeLists[index][0]));

    const rowsWritten = await upsertRows(
      ctx.admin,
      "calendly_bookings",
      bookings,
      "calendly_uri",
    );

    return {
      rowsWritten,
      details: { calendly_bookings: rowsWritten, events_seen: events.length },
    };
  },
};
