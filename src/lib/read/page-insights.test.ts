import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { delta } from "./compare";
import type { PageDetail, PageKpiId } from "./page-detail";
import { buildPageInsights } from "./page-insights";

type Input = Parameters<typeof buildPageInsights>[0];

function input(overrides: Partial<Record<PageKpiId, number | null>> = {}, rest: Partial<Input> = {}): Input {
  const values: Record<PageKpiId, number | null> = {
    views: 140,
    sessions: 130,
    users: 120,
    engagementRate: 0.5,
    bounceRate: 0.5,
    avgSessionDuration: 8,
    landingSessions: 127,
    scrollDepthPct: 100,
    activeTimeSeconds: 10,
    formSubmissions: null,
    ...overrides,
  };
  const kpis = Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, delta(value, null)]),
  ) as PageDetail["kpis"];
  return {
    kpis,
    behaviour: {
      sessions: 40,
      rageClickPct: null,
      deadClickPct: null,
      quickBackPct: null,
      excessiveScrollPct: null,
      scriptErrorPct: null,
    },
    sources: {
      available: true,
      rows: [
        { source: "encharge", medium: "warm", sessions: 90 },
        { source: "(direct)", medium: "(none)", sessions: 30 },
      ],
    },
    coverage: { days: 30, ga4Days: 30, clarityDays: 25 },
    forms: { available: true, submissions: 0, byForm: [] },
    conversions: [],
    ...rest,
  };
}

const texts = (rows: ReturnType<typeof buildPageInsights>) => rows.map((row) => row.text).join("\n");

describe("buildPageInsights", () => {
  it("says how many visits there were and where they started", () => {
    const out = texts(buildPageInsights(input()));
    assert.match(out, /130 visits included this page over 30 days \(140 views, 127 visits started here\)/);
    assert.match(out, /people arrive here from outside the site/);
  });

  it("names the top source in plain English with its share", () => {
    const out = texts(buildPageInsights(input()));
    assert.match(out, /Most visits that started here came from Encharge email \(warm\) \(75%\)/);
    assert.match(out, /rises and falls with email sends/);
  });

  it("explains a full scroll on a short page", () => {
    assert.match(texts(buildPageInsights(input())), /Scroll depth is 100% but visitors were active for only 10s/);
    assert.doesNotMatch(texts(buildPageInsights(input({ activeTimeSeconds: 95 }))), /Scroll depth/);
    assert.doesNotMatch(texts(buildPageInsights(input({ scrollDepthPct: 40 }))), /Scroll depth/);
  });

  it("flags a high bounce rate and praises a low one", () => {
    const high = buildPageInsights(input({ bounceRate: 0.8 }));
    assert.ok(high.some((row) => row.tone === "bad" && /80% of visits/.test(row.text)));
    const low = buildPageInsights(input({ bounceRate: 0.1 }));
    assert.ok(low.some((row) => row.tone === "good" && /Only 10%/.test(row.text)));
  });

  it("warns when the sample is too small to trust", () => {
    const out = texts(buildPageInsights(input({ sessions: 3, views: 3, landingSessions: 2, bounceRate: 0.9 })));
    assert.match(out, /Only 3 visits in this range/);
    assert.doesNotMatch(out, /90% of visits/);
  });

  it("says nothing about sources it does not have", () => {
    const out = texts(
      buildPageInsights(input({}, { sources: { available: false, reason: "Traffic sources per page are not collected yet." } })),
    );
    assert.doesNotMatch(out, /came from/);
  });

  it("counts conversions from key events and forms", () => {
    const out = texts(
      buildPageInsights(
        input({}, {
          conversions: [{ eventKey: "form_submission", placement: "hero", count: 2 }],
          forms: { available: true, submissions: 1, byForm: [{ name: "contact", value: 1 }] },
        }),
      ),
    );
    assert.match(out, /3 conversions came from this page/);
  });

  it("returns nothing for a page with no stored numbers", () => {
    const empty = input(
      { views: null, sessions: null, users: null, bounceRate: null, landingSessions: null, scrollDepthPct: null, activeTimeSeconds: null },
      { sources: { available: true, rows: [] }, behaviour: { ...input().behaviour, sessions: 0 } },
    );
    assert.deepEqual(buildPageInsights(empty), []);
  });
});
