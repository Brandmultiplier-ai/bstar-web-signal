import { classifyBookings, type ClassifiedBooking, type StoredBooking } from "@/lib/calendly-taxonomy";
import type { ReaderClient } from "@/lib/supabase/types";

/** Only the columns the taxonomy reads. */
const BOOKING_COLUMNS =
  "calendly_uri, event_name, event_slug, status, scheduled_at, booked_at, invitee_name, invitee_email, invitee_uri, rescheduled, old_invitee_uri, new_invitee_uri, utm_source, utm_medium, utm_campaign, utm_content, utm_term";

/**
 * Every stored booking, classified. Reschedule chains can cross any date
 * range, so classification always sees the whole table.
 */
export async function readClassifiedBookings(
  supabase: ReaderClient,
): Promise<{ rows: ClassifiedBooking[]; error: string | null }> {
  const { data, error } = await supabase.from("calendly_bookings").select(BOOKING_COLUMNS);
  if (error) return { rows: [], error: error.message };
  return { rows: classifyBookings((data ?? []) as StoredBooking[]), error: null };
}
