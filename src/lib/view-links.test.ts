import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { pageViewHref, rangeFromSearch, sourceViewHref } from "./view-links";

describe("view links", () => {
  it("encodes the site, path and range", () => {
    assert.equal(
      pageViewHref("brandmultiplier", "/encharge-click-detection", { days: 7 }),
      "/pages/view?site=brandmultiplier&path=%2Fencharge-click-detection&days=7",
    );
    assert.equal(
      sourceViewHref("brandmultiplier", "(direct)", "(none)", { all: true }),
      "/sources/view?site=brandmultiplier&source=%28direct%29&medium=%28none%29&all=1",
    );
    assert.equal(
      pageViewHref("crc", "/a b?x=1", { start: "2026-11-01", end: "2026-11-05" }),
      "/pages/view?site=crc&path=%2Fa+b%3Fx%3D1&start=2026-11-01&end=2026-11-05",
    );
  });

  it("reads back the range it wrote", () => {
    for (const range of [{ days: 7 }, { all: true }, { start: "2026-11-01", end: "2026-11-05" }]) {
      const href = pageViewHref("s", "/", range);
      assert.deepEqual(rangeFromSearch(new URL(href, "https://x.test").searchParams), range);
    }
  });

  it("ignores a missing or malformed range", () => {
    assert.equal(rangeFromSearch(new URLSearchParams("")), null);
    assert.equal(rangeFromSearch(new URLSearchParams("days=abc")), null);
    assert.equal(rangeFromSearch(new URLSearchParams("days=9999")), null);
    assert.equal(rangeFromSearch(new URLSearchParams("start=2026-11-05&end=2026-11-01")), null);
    assert.equal(rangeFromSearch(new URLSearchParams("start=yesterday&end=today")), null);
  });
});
