import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  abandonedRunAt,
  clarityStatusText,
  deliveryFailureAt,
  describeFreshness,
  httpStatusIsFailure,
  summarizeRuns,
  type DeliveryStatus,
} from "./freshness";

const hour = 60 * 60 * 1000;

describe("summarizeRuns", () => {
  const now = Date.parse("2026-11-07T00:00:00Z");

  it("reads the latest success, note, and failure from one batch", () => {
    const result = summarizeRuns(
      [
        { source: "clarity", status: "error", started_at: "2026-11-06T05:00:00Z", finished_at: "2026-11-06T05:01:00Z", error: "Clarity failed for a.com." },
        { source: "clarity", status: "success", started_at: "2026-11-05T05:00:00Z", finished_at: "2026-11-05T05:01:00Z", error: "note" },
      ],
      null,
      now,
    );
    assert.equal(result.lastSuccessAt, "2026-11-05T05:01:00Z");
    assert.equal(result.note, "note");
    assert.equal(result.failureMessage, "Clarity failed for a.com.");
    assert.equal(result.lastErrorAt, "2026-11-06T05:01:00Z");
  });

  it("counts an abandoned run and a delivery failure", () => {
    const result = summarizeRuns(
      [{ source: "ga4", status: "running", started_at: "2026-11-06T23:00:00Z", finished_at: null, error: null }],
      "2026-11-06T06:00:00Z",
      now,
    );
    assert.equal(result.lastSuccessAt, null);
    assert.equal(result.lastErrorAt, "2026-11-06T23:00:00Z");
  });
});

describe("clarity status text", () => {
  it("names a partial failure without treating the successful project as failed", () => {
    const freshness = {
      lastSuccessAt: new Date().toISOString(),
      lastErrorAt: null,
      note: "Clarity failed for chrisrubincreativ.com.",
    };
    assert.equal(describeFreshness("clarity", freshness).state, "fresh");
    assert.equal(clarityStatusText(freshness), "Clarity failed for chrisrubincreativ.com.");
  });

  it("uses the error text when every project failed", () => {
    const freshness = {
      lastSuccessAt: new Date(Date.now() - hour).toISOString(),
      lastErrorAt: new Date().toISOString(),
      note: "older success note",
      failureMessage: "Clarity failed for brandmultiplier.ai, chrisrubincreativ.com.",
    };
    assert.equal(describeFreshness("clarity", freshness).state, "failing");
    assert.equal(
      clarityStatusText(freshness),
      "Clarity failed for brandmultiplier.ai, chrisrubincreativ.com.",
    );
  });
});

describe("describeFreshness", () => {
  it("keeps a recent success fresh", () => {
    const result = describeFreshness("ga4", {
      lastSuccessAt: new Date().toISOString(),
      lastErrorAt: null,
    });
    assert.equal(result.state, "fresh");
  });

  it("shows a newer failure the same day and does not call it a zero", () => {
    const result = describeFreshness("ga4", {
      lastSuccessAt: new Date(Date.now() - hour).toISOString(),
      lastErrorAt: new Date().toISOString(),
    });
    assert.equal(result.state, "failing");
    assert.match(result.message, /not a zero/);
  });

  it("marks GA4 and Clarity overdue after 1 day and Calendly after 12 hours", () => {
    const fourDays = new Date(Date.now() - 4 * 24 * hour).toISOString();
    const twoDays = new Date(Date.now() - 2 * 24 * hour).toISOString();
    const halfDay = new Date(Date.now() - 13 * hour).toISOString();
    assert.equal(describeFreshness("ga4", { lastSuccessAt: twoDays, lastErrorAt: null }).state, "stale");
    assert.equal(describeFreshness("ga4", { lastSuccessAt: halfDay, lastErrorAt: null }).state, "fresh");
    assert.equal(describeFreshness("calendly", { lastSuccessAt: halfDay, lastErrorAt: null }).state, "stale");
    assert.match(
      describeFreshness("calendly", { lastSuccessAt: halfDay, lastErrorAt: null }).message,
      /expected every 12 hours/,
    );
    assert.equal(
      describeFreshness("clarity", { lastSuccessAt: twoDays, lastErrorAt: null }).state,
      "stale",
    );
    assert.match(
      describeFreshness("calendly", { lastSuccessAt: fourDays, lastErrorAt: null }).message,
      /not a zero/,
    );
  });

  it("does not let an older failure override a later success", () => {
    const result = describeFreshness("clarity", {
      lastSuccessAt: new Date().toISOString(),
      lastErrorAt: new Date(Date.now() - 24 * hour).toISOString(),
    });
    assert.equal(result.state, "fresh");
  });
});

describe("delivery status and the chip", () => {
  const recentSuccess = new Date(Date.now() - hour).toISOString();
  const base: DeliveryStatus = {
    source: "ga4",
    cron_status: "succeeded",
    cron_ended_at: "2026-11-04T06:00:00Z",
    http_status: 200,
    http_timed_out: false,
    http_at: "2026-11-04T06:01:00Z",
  };

  it("treats a null http status as unknown", () => {
    assert.equal(httpStatusIsFailure(null), false);
    assert.equal(
      deliveryFailureAt({
        ...base,
        http_status: null,
        http_timed_out: true,
        http_at: null,
      }),
      null,
    );
    assert.equal(
      describeFreshness("ga4", { lastSuccessAt: recentSuccess, lastErrorAt: null }).state,
      "fresh",
    );
    assert.notEqual(
      describeFreshness("ga4", { lastSuccessAt: null, lastErrorAt: null }).state,
      "fresh",
    );
  });

  it("does not treat a 200 as a failure or as a success on its own", () => {
    assert.equal(httpStatusIsFailure(200), false);
    assert.equal(deliveryFailureAt(base), null);
    assert.equal(
      describeFreshness("ga4", { lastSuccessAt: recentSuccess, lastErrorAt: null }).state,
      "fresh",
    );
    assert.notEqual(
      describeFreshness("gsc", { lastSuccessAt: null, lastErrorAt: null }).state,
      "fresh",
    );
  });

  it("turns the chip red for a 401", () => {
    const at = deliveryFailureAt({
      ...base,
      source: "gsc",
      http_status: 401,
      http_at: "2026-11-04T06:16:00Z",
    });
    assert.equal(at, "2026-11-04T06:16:00Z");
    assert.equal(
      describeFreshness("gsc", { lastSuccessAt: "2026-11-04T06:00:00Z", lastErrorAt: at }).state,
      "failing",
    );
  });

  it("turns the chip red for a failed cron run even when http status is null", () => {
    const at = deliveryFailureAt({
      ...base,
      source: "clarity",
      cron_status: "failed",
      cron_ended_at: "2026-11-04T05:00:00Z",
      http_status: null,
      http_timed_out: null,
      http_at: null,
    });
    assert.equal(at, "2026-11-04T05:00:00Z");
    assert.equal(
      describeFreshness("clarity", { lastSuccessAt: "2026-11-03T05:00:00Z", lastErrorAt: at }).state,
      "failing",
    );
  });

  it("turns the chip red when a source is stale beyond its cadence", () => {
    const fourDays = new Date(Date.now() - 4 * 24 * hour).toISOString();
    const result = describeFreshness("ga4", { lastSuccessAt: fourDays, lastErrorAt: null });
    assert.equal(result.state, "stale");
    assert.match(result.message, /not a zero/);
    assert.equal(deliveryFailureAt({ ...base, http_status: null, http_at: null }), null);
  });
});

describe("abandonedRunAt", () => {
  it("waits out an in-flight run", () => {
    const started = new Date(Date.now() - 60 * 1000).toISOString();
    assert.equal(abandonedRunAt({ status: "running", started_at: started }), null);
  });

  it("counts a run still open past the HTTP timeout as a failed pull", () => {
    const started = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    assert.equal(abandonedRunAt({ status: "running", started_at: started }), started);
  });

  it("ignores a finished success", () => {
    assert.equal(
      abandonedRunAt({ status: "success", started_at: new Date(Date.now() - 24 * hour).toISOString() }),
      null,
    );
  });
});
