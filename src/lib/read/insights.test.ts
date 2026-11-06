import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildInsights, type InsightKpi } from "./insights";

const kpi = (
  id: string,
  current: number,
  previous: number | null,
  goodWhen: "up" | "down" = "up",
  format: InsightKpi["format"] = "number",
): InsightKpi => ({
  id,
  label: id,
  format,
  goodWhen,
  available: true,
  current,
  previous,
  change: previous ? (current - previous) / previous : null,
});

const empty = { risers: [], fallers: [] };

describe("buildInsights", () => {
  it("names the strongest improvement and the worst drop", () => {
    const out = buildInsights({
      kpis: [kpi("sessions", 150, 100), kpi("clicks", 40, 50), kpi("rage", 2, 5, "down", "percent")],
      changed: { pages: empty, queries: empty, channels: empty },
      daily: [],
    });
    assert.equal(out[0].tone, "good");
    assert.match(out[0].text, /^rage fell 60%/);
    assert.equal(out[1].tone, "bad");
    assert.match(out[1].text, /^clicks fell 20%/);
  });

  it("describes a worse rank as slipping, not rising", () => {
    const out = buildInsights({
      kpis: [kpi("position", 9.3, 8.4, "down", "position")],
      changed: null,
      daily: [],
    });
    assert.equal(out[0].text, "position slipped from 8.4 to 9.3. This is the first thing to look at.");
  });

  it("ignores moves under 5%", () => {
    const out = buildInsights({
      kpis: [kpi("sessions", 102, 100)],
      changed: { pages: empty, queries: empty, channels: empty },
      daily: [],
    });
    assert.deepEqual(out, [
      { tone: "neutral", text: "Nothing moved by more than 5% against the previous period." },
    ]);
  });

  it("flags traffic that does not turn into bookings", () => {
    const out = buildInsights({
      kpis: [kpi("sessions", 200, 100), kpi("bookings", 3, 3)],
      changed: null,
      daily: [],
    });
    assert.ok(out.some((item) => item.text.startsWith("Visits grew 100% but sales calls")));
  });

  it("does not compare bookings when there were none before", () => {
    const out = buildInsights({
      kpis: [kpi("sessions", 200, 100), kpi("bookings", 0, 0)],
      changed: null,
      daily: [],
    });
    assert.ok(!out.some((item) => item.text.includes("sales calls")));
  });

  it("flags more impressions with a falling click rate", () => {
    const out = buildInsights({
      kpis: [kpi("impressions", 2000, 1000), kpi("ctr", 1, 2, "up", "percent")],
      changed: null,
      daily: [],
    });
    assert.ok(out.some((item) => item.text.includes("smaller share of searchers clicked")));
  });

  it("finds the busiest stored day and skips days with no data", () => {
    const daily = Array.from({ length: 8 }, (_, i) => ({
      date: `2026-11-0${i + 1}`,
      sessions: i === 3 ? 90 : i === 5 ? null : 10,
      clicks: null,
    }));
    const out = buildInsights({ kpis: [], changed: null, daily });
    assert.ok(out.some((item) => item.text === "The busiest day was Wednesday 2026-11-04 with 90 visits."));
  });

  it("says when figures are missing instead of treating them as zero", () => {
    const out = buildInsights({
      kpis: [{ id: "forms", label: "forms", format: "number", goodWhen: "up", available: false, reason: "x" }],
      changed: null,
      daily: [],
    });
    assert.match(out[0].text, /^1 figure has no data/);
  });
});
