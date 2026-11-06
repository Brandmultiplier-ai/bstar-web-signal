import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isTransient } from "./transient";

describe("isTransient", () => {
  it("retries dropped connections and timeouts", () => {
    assert.equal(isTransient(new Error("Upsert into ga4_daily failed: TypeError: fetch failed")), true);
    assert.equal(isTransient(new Error("request failed", { cause: new Error("ECONNRESET") })), true);
    assert.equal(isTransient(new Error("Request timed out after 30000ms")), true);
    assert.equal(isTransient(new Error("GA4 returned 503 Service Unavailable")), true);
  });

  it("does not retry credential or request errors", () => {
    assert.equal(isTransient(new Error("PERMISSION_DENIED: User does not have access")), false);
    assert.equal(isTransient(new Error("Clarity returned 401 for project k0r7x8mkc7")), false);
    assert.equal(isTransient(new Error("Missing CLARITY_API_TOKEN")), false);
  });
});
