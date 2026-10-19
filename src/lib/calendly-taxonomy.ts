/**
 * Conversion classes from the September 29 taxonomy.
 *
 * Classification happens when the dashboard reads stored bookings. It does not
 * rewrite history. Event slugs are filled in on later syncs; until then the
 * Calendly display name is enough for the three types that already exist.
 *
 * Quick Q&A, personal calendar entries, interviews, and anything else not
 * named below stay excluded. They are reported as excluded, never folded into
 * Primary, Partner, or Founder-relayed.
 */

export type ConversionClass = "primary" | "partner" | "relay" | "excluded";

export type ExclusionReason = "test" | "company-domain" | "outside-taxonomy";

export type ConversionProperty = "brandmultiplier.ai" | "chrisrubincreativ.com";

export type StoredBooking = {
  calendly_uri: string;
  event_name: string | null;
  event_slug?: string | null;
  status: string | null;
  scheduled_at: string;
  booked_at: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  invitee_uri?: string | null;
  rescheduled?: boolean | null;
  old_invitee_uri?: string | null;
  new_invitee_uri?: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
};

export type ClassifiedBooking = StoredBooking & {
  conversionClass: ConversionClass;
  property: ConversionProperty | null;
  exclusionReason: ExclusionReason | null;
  /** Creation date of the original booking, after reschedule chains. */
  countedOn: string;
  /** A later invitee in the reschedule chain is the one that counts. */
  superseded: boolean;
  /** Terminal booking that was cancelled, not a reschedule step. */
  cancellation: boolean;
};

/** Invitees on these domains are internal and never count. */
export const COMPANY_DOMAINS = ["brandmultiplier.ai", "chrisrubincreativ.com"] as const;

const CRC_DIAGNOSTIC_SLUG = "book-crc/the-diagnostic-20-min-with-chris";

function normName(name: string | null): string {
  return (name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[’`]/g, "'");
}

function normSlug(slug: string | null | undefined): string {
  return (slug ?? "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

/** "TEST", "Testy", "TEST 2". Does not match a name like Contest. */
export function isTestInvitee(name: string | null, email: string | null): boolean {
  const token = /(^|[^a-z])test/i;
  if (token.test(name ?? "")) return true;
  const local = (email ?? "").split("@")[0] ?? "";
  return token.test(local);
}

function emailDomain(email: string | null): string {
  return (email ?? "").split("@")[1]?.trim().toLowerCase() ?? "";
}

export function isCompanyDomain(email: string | null): boolean {
  return (COMPANY_DOMAINS as readonly string[]).includes(emailDomain(email));
}

function matchEvent(
  name: string | null,
  slug: string | null | undefined,
): { conversionClass: Exclude<ConversionClass, "excluded">; property: ConversionProperty | null } | null {
  const eventName = normName(name);
  const eventSlug = normSlug(slug);

  if (eventSlug === CRC_DIAGNOSTIC_SLUG) {
    return { conversionClass: "primary", property: "chrisrubincreativ.com" };
  }
  if (eventSlug === "book-crc/storyline" || eventName === "what's your storyline?") {
    return { conversionClass: "primary", property: "brandmultiplier.ai" };
  }
  if (eventSlug.includes("diagnostic") || eventName.includes("diagnostic")) {
    return { conversionClass: "primary", property: "brandmultiplier.ai" };
  }
  if (eventSlug === "book-crc/connector-call" || eventName === "the connector fit call") {
    return { conversionClass: "partner", property: null };
  }
  if (eventSlug === "book-crc/quick-chat" || eventName === "quick chat") {
    return { conversionClass: "relay", property: null };
  }
  return null;
}

function day(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/**
 * Walk old_invitee until the original booking. The count date is that
 * invitee's creation time, not the meeting time and not the reschedule time.
 */
function rootBookedAt(row: StoredBooking, byInvitee: Map<string, StoredBooking>): string | null {
  const seen = new Set<string>();
  let current = row;
  while (current.old_invitee_uri) {
    const key = current.invitee_uri ?? current.calendly_uri;
    if (seen.has(key)) break;
    seen.add(key);
    const parent = byInvitee.get(current.old_invitee_uri);
    if (!parent) break;
    current = parent;
  }
  return current.booked_at ?? current.scheduled_at;
}

export function classifyBookings(rows: StoredBooking[]): ClassifiedBooking[] {
  const byInvitee = new Map<string, StoredBooking>();
  for (const row of rows) {
    if (row.invitee_uri) byInvitee.set(row.invitee_uri, row);
  }

  return rows.map((row) => {
    const superseded = Boolean(row.new_invitee_uri && byInvitee.has(row.new_invitee_uri));
    const orphanReschedule = Boolean(!superseded && (row.rescheduled || row.new_invitee_uri));
    const cancellation =
      !superseded && !orphanReschedule && (row.status ?? "").toLowerCase() === "canceled";

    let conversionClass: ConversionClass = "excluded";
    let property: ConversionProperty | null = null;
    let exclusionReason: ExclusionReason | null = "outside-taxonomy";

    if (isTestInvitee(row.invitee_name, row.invitee_email)) {
      exclusionReason = "test";
    } else if (isCompanyDomain(row.invitee_email)) {
      exclusionReason = "company-domain";
    } else {
      const match = matchEvent(row.event_name, row.event_slug);
      if (match) {
        conversionClass = match.conversionClass;
        property = match.property;
        exclusionReason = null;
      }
    }

    const countedOn =
      day(rootBookedAt(row, byInvitee)) ?? day(row.booked_at) ?? day(row.scheduled_at) ?? "";

    return {
      ...row,
      conversionClass,
      property,
      exclusionReason,
      countedOn,
      superseded,
      cancellation,
    };
  });
}

export function inCountedRange(row: ClassifiedBooking, start: string, end: string): boolean {
  return row.countedOn >= start && row.countedOn <= end;
}

/** Live Primary, Partner, or Founder-relayed booking. Cancelled and excluded are separate facts. */
export function isHeadline(row: ClassifiedBooking): boolean {
  return !row.superseded && !row.cancellation && row.conversionClass !== "excluded";
}

/**
 * A missing UTM on Quick Chat is expected: that link is handed out directly.
 * Only Primary and Partner can have an attribution gap.
 */
export function isAttributionGap(row: ClassifiedBooking): boolean {
  return (
    isHeadline(row) &&
    (row.conversionClass === "primary" || row.conversionClass === "partner") &&
    !row.utm_source
  );
}
