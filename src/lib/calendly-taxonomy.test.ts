import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBookings,
  inCountedRange,
  isAttributionGap,
  isHeadline,
  type StoredBooking,
} from "./calendly-taxonomy";

function booking(partial: Partial<StoredBooking> & Pick<StoredBooking, "calendly_uri">): StoredBooking {
  return {
    event_name: null,
    status: "active",
    scheduled_at: "2026-09-30T15:00:00Z",
    booked_at: "2026-09-01T12:00:00Z",
    invitee_name: "Ada Lovelace",
    invitee_email: "ada@paramark.com",
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    ...partial,
  };
}

test("Paramark reschedule counts once, on the original creation date, as founder-relayed", () => {
  const rows = classifyBookings([
    booking({
      calendly_uri: "event-old",
      invitee_uri: "invitee-old",
      new_invitee_uri: "invitee-new",
      rescheduled: true,
      event_name: "Quick Chat",
      status: "canceled",
      booked_at: "2026-09-01T12:00:00Z",
      scheduled_at: "2026-09-22T15:00:00Z",
      invitee_name: "Pranav Piyush",
    }),
    booking({
      calendly_uri: "event-new",
      invitee_uri: "invitee-new",
      old_invitee_uri: "invitee-old",
      event_name: "Quick Chat",
      status: "active",
      booked_at: "2026-09-22T16:00:00Z",
      scheduled_at: "2026-10-01T15:00:00Z",
      invitee_name: "Pranav Piyush",
    }),
  ]);

  const visible = rows.filter((row) => !row.superseded);
  assert.equal(visible.length, 1);
  assert.equal(visible[0]?.calendly_uri, "event-new");
  assert.equal(visible[0]?.countedOn, "2026-09-01");
  assert.equal(visible[0]?.conversionClass, "relay");
  assert.equal(visible[0]?.cancellation, false);
  assert.equal(isHeadline(visible[0]!), true);
  assert.equal(isAttributionGap(visible[0]!), false);
  assert.equal(inCountedRange(visible[0]!, "2026-09-01", "2026-09-01"), true);
  assert.equal(inCountedRange(visible[0]!, "2026-09-22", "2026-09-22"), false);
});

test("Quick Q&A is Relay when it is the quick-chat event type", () => {
  const [row] = classifyBookings([
    booking({
      calendly_uri: "old-name",
      event_name: "Quick Q&A",
      event_slug: "book-crc/quick-chat",
      invitee_email: "founder@example.com",
    }),
  ]);
  assert.equal(row?.conversionClass, "relay");
  assert.equal(isAttributionGap(row!), false);
});

test("tests, company domains, interviews, and unnamed event types stay out of every class", () => {
  const rows = classifyBookings([
    booking({
      calendly_uri: "test",
      event_name: "What's your Storyline?",
      invitee_name: "TEST",
      utm_source: "instantly",
    }),
    booking({
      calendly_uri: "staff",
      event_name: "What's your Storyline?",
      invitee_email: "chris@chrisrubincreativ.com",
    }),
    booking({
      calendly_uri: "mtg",
      event_name: "MTG: Case Study interview",
      invitee_name: "Case Guest",
    }),
    booking({
      calendly_uri: "family",
      event_name: "Soren<>Dad hang time",
      invitee_name: "Soren",
    }),
    booking({
      calendly_uri: "qa",
      event_name: "Quick Q&A",
      invitee_name: "Someone Real",
    }),
  ]);

  assert.ok(rows.every((row) => row.conversionClass === "excluded"));
  assert.ok(rows.every((row) => !isHeadline(row)));
  assert.equal(rows.find((row) => row.calendly_uri === "test")?.exclusionReason, "test");
  assert.equal(rows.find((row) => row.calendly_uri === "staff")?.exclusionReason, "company-domain");
  assert.equal(rows.find((row) => row.calendly_uri === "qa")?.exclusionReason, "outside-taxonomy");
});

test("Storyline, Diagnostic, and Connector are split, and a cancellation is reported apart from the headline", () => {
  const rows = classifyBookings([
    booking({
      calendly_uri: "story",
      event_name: "What's your Storyline?",
      invitee_email: "founder@example.com",
      utm_source: null,
    }),
    booking({
      calendly_uri: "diag",
      event_slug: "book-crc/the-diagnostic-20-min-with-chris",
      event_name: "Diagnostic",
      invitee_email: "founder@example.com",
      utm_source: "linkedin",
    }),
    booking({
      calendly_uri: "partner",
      event_name: "The Connector Fit Call",
      invitee_email: "partner@example.com",
    }),
    booking({
      calendly_uri: "cancelled-story",
      event_name: "What's your Storyline?",
      status: "canceled",
      invitee_email: "founder@example.com",
    }),
  ]);

  const story = rows.find((row) => row.calendly_uri === "story")!;
  const diag = rows.find((row) => row.calendly_uri === "diag")!;
  const partner = rows.find((row) => row.calendly_uri === "partner")!;
  const cancelled = rows.find((row) => row.calendly_uri === "cancelled-story")!;

  assert.equal(story.conversionClass, "primary");
  assert.equal(story.property, "brandmultiplier.ai");
  assert.equal(isAttributionGap(story), true);

  assert.equal(diag.conversionClass, "primary");
  assert.equal(diag.property, "chrisrubincreativ.com");
  assert.equal(isHeadline(diag), true);

  assert.equal(partner.conversionClass, "partner");
  assert.equal(isHeadline(partner), true);

  assert.equal(cancelled.conversionClass, "primary");
  assert.equal(cancelled.cancellation, true);
  assert.equal(isHeadline(cancelled), false);
});
