import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  abandonedRunAt,
  deliveryFailureAt,
  describeFreshness,
  type DeliveryStatus,
} from "./freshness";

const hour = 60 * 60 * 1000;

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

  it("marks GA4 overdue after its 3 day cadence and Clarity after 1 day", () => {
    const fourDays = new Date(Date.now() - 4 * 24 * hour).toISOString();
    const twoDays = new Date(Date.now() - 2 * 24 * hour).toISOString();
    assert.equal(describeFreshness("ga4", { lastSuccessAt: fourDays, lastErrorAt: null }).state, "stale");
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

describe("deliveryFailureAt", () => {
  const base: DeliveryStatus = {
    source: "ga4",
    cron_status: "succeeded",
    cron_ended_at: "2026-11-04T06:00:00Z",
    http_status: 200,
    http_timed_out: false,
    http_at: "2026-11-04T06:01:00Z",
  };

  it("ignores a successful cron and a 200 response", () => {
    assert.equal(deliveryFailureAt(base), null);
  });

  it("uses the HTTP failure time when cron only queued the request", () => {
    assert.equal(
      deliveryFailureAt({ ...base, source: "gsc", http_status: 500, http_at: "2026-11-04T06:16:00Z" }),
      "2026-11-04T06:16:00Z",
    );
  });

  it("uses the cron failure time when the request never left the database", () => {
    assert.equal(
      deliveryFailureAt({
        ...base,
        source: "clarity",
        cron_status: "failed",
        cron_ended_at: "2026-11-04T05:00:00Z",
        http_status: null,
        http_timed_out: null,
        http_at: null,
      }),
      "2026-11-04T05:00:00Z",
    );
  });

  it("treats a timeout as a failure", () => {
    assert.equal(
      deliveryFailureAt({
        ...base,
        source: "calendly",
        http_status: null,
        http_timed_out: true,
        http_at: "2026-11-04T06:35:00Z",
      }),
      "2026-11-04T06:35:00Z",
    );
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
