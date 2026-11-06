import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { delta, inWindow, movers, previousWindow, sumBy } from "./compare";

describe("previousWindow", () => {
  it("is the same length and ends the day before", () => {
    assert.deepEqual(previousWindow({ start: "2026-10-01", end: "2026-10-28" }), {
      start: "2026-09-03",
      end: "2026-09-30",
    });
  });

  it("handles a single day", () => {
    assert.deepEqual(previousWindow({ start: "2026-03-01", end: "2026-03-01" }), {
      start: "2026-02-28",
      end: "2026-02-28",
    });
  });
});

describe("delta", () => {
  it("is relative to the previous value", () => {
    assert.equal(delta(150, 100).change, 0.5);
    assert.equal(delta(50, 100).change, -0.5);
  });

  it("has no change without a baseline", () => {
    assert.equal(delta(10, 0).change, null);
    assert.equal(delta(10, null).change, null);
    assert.equal(delta(null, 10).change, null);
  });
});

describe("movers", () => {
  it("ranks risers and fallers and treats missing keys as zero", () => {
    const result = movers(
      new Map([
        ["/a", 30],
        ["/b", 5],
        ["/new", 12],
      ]),
      new Map([
        ["/a", 10],
        ["/b", 25],
        ["/gone", 4],
      ]),
    );
    assert.deepEqual(
      result.risers.map((row) => [row.key, row.difference]),
      [
        ["/a", 20],
        ["/new", 12],
      ],
    );
    assert.deepEqual(
      result.fallers.map((row) => [row.key, row.difference]),
      [
        ["/b", -20],
        ["/gone", -4],
      ],
    );
  });

  it("leaves out unchanged keys", () => {
    const result = movers(new Map([["/same", 3]]), new Map([["/same", 3]]));
    assert.equal(result.risers.length + result.fallers.length, 0);
  });
});

describe("sumBy and inWindow", () => {
  it("totals by key and checks timestamps by day", () => {
    const totals = sumBy(
      [
        { k: "x", v: 1 },
        { k: "x", v: 2 },
        { k: "y", v: 5 },
      ],
      (row) => row.k,
      (row) => row.v,
    );
    assert.equal(totals.get("x"), 3);
    assert.equal(inWindow("2026-10-28T23:59:00Z", { start: "2026-10-01", end: "2026-10-28" }), true);
    assert.equal(inWindow("2026-10-29T00:00:00Z", { start: "2026-10-01", end: "2026-10-28" }), false);
  });
});
