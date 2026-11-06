import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatLongDate } from "./dates";

describe("formatLongDate", () => {
  it("writes the day as an ordinal with the full month", () => {
    assert.equal(formatLongDate("2026-11-06"), "6th November 2026");
    assert.equal(formatLongDate("2026-11-01"), "1st November 2026");
    assert.equal(formatLongDate("2026-11-02"), "2nd November 2026");
    assert.equal(formatLongDate("2026-11-03"), "3rd November 2026");
    assert.equal(formatLongDate("2026-11-30"), "30th November 2026");
  });

  it("uses th for 11, 12 and 13 and st for 21", () => {
    assert.equal(formatLongDate("2026-01-11"), "11th January 2026");
    assert.equal(formatLongDate("2026-01-12"), "12th January 2026");
    assert.equal(formatLongDate("2026-01-13"), "13th January 2026");
    assert.equal(formatLongDate("2026-03-21"), "21st March 2026");
    assert.equal(formatLongDate("2026-03-22"), "22nd March 2026");
  });
});
