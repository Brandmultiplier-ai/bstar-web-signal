import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capLandingSources } from "./ga4-landing-sources";

const row = (page_path: string, source: string, sessions: number, date = "2026-11-01") => ({
  site_id: "s1",
  date,
  page_path,
  source,
  medium: "organic",
  sessions,
  users: sessions,
});

describe("capLandingSources", () => {
  it("sums rows that fold to the same key", () => {
    const out = capLandingSources([row("/", "google", 2), row("/", "google", 3)]);
    assert.equal(out.length, 1);
    assert.equal(out[0]?.sessions, 5);
    assert.equal(out[0]?.users, 5);
  });

  it("keeps the busiest pages per day and the busiest sources per page", () => {
    const out = capLandingSources(
      [
        row("/a", "google", 10),
        row("/a", "bing", 1),
        row("/a", "duck", 5),
        row("/b", "google", 3),
        row("/c", "google", 20),
      ],
      2,
      2,
    );
    const keys = out.map((r) => `${r.page_path}:${r.source}`).sort();
    assert.deepEqual(keys, ["/a:duck", "/a:google", "/c:google"]);
  });

  it("caps each day on its own", () => {
    const out = capLandingSources(
      [row("/a", "google", 1, "2026-11-01"), row("/b", "google", 1, "2026-11-02")],
      1,
      1,
    );
    assert.equal(out.length, 2);
  });
});
