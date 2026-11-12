import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSourceDetail, type SourceDetailInput } from "./source-detail";

const current = { start: "2026-11-01", end: "2026-11-05" };
const previous = { start: "2026-10-27", end: "2026-10-31" };

const input = (over: Partial<SourceDetailInput> = {}): SourceDetailInput => ({
  source: "encharge",
  medium: "warm",
  current,
  previous,
  totals: [
    { date: "2026-11-01", sessions: 10, users: 9 },
    { date: "2026-11-03", sessions: 20, users: 18 },
    { date: "2026-10-28", sessions: 15, users: 15 },
  ],
  site: [
    { date: "2026-11-01", sessions: 60 },
    { date: "2026-11-03", sessions: 60 },
    { date: "2026-10-28", sessions: 100 },
  ],
  landings: {
    available: true,
    rows: [
      { date: "2026-11-01", page_path: "/encharge-click-detection", sessions: 8, users: 8 },
      { date: "2026-11-03", page_path: "/encharge-click-detection", sessions: 16, users: 15 },
      { date: "2026-11-03", page_path: "/", sessions: 6, users: 6 },
      { date: "2026-10-28", page_path: "/", sessions: 50, users: 50 },
    ],
  },
  engagement: [
    { date: "2026-11-01", page_path: "/", sessions: 40, engaged_sessions: 20, bounce_rate: 0.5, avg_session_duration: 30 },
    { date: "2026-11-03", page_path: "/", sessions: 60, engaged_sessions: 45, bounce_rate: 0.25, avg_session_duration: 60 },
  ],
  ...over,
});

describe("buildSourceDetail", () => {
  it("totals visits from the source and compares them with the window before", () => {
    const detail = buildSourceDetail(input());
    assert.equal(detail.kpis.sessions.current, 30);
    assert.equal(detail.kpis.sessions.previous, 15);
    assert.equal(detail.kpis.sessions.change, 1);
    assert.equal(detail.kpis.users.current, 27);
    assert.equal(detail.kpis.share.current, 0.25);
    assert.equal(detail.kpis.share.previous, 0.15);
  });

  it("lists landing pages for the current window only, largest first", () => {
    const detail = buildSourceDetail(input());
    assert.ok(detail.pages.available);
    if (!detail.pages.available) return;
    assert.equal(detail.pages.sessions, 30);
    assert.deepEqual(
      detail.pages.rows.map((row) => [row.path, row.sessions, row.share]),
      [
        ["/encharge-click-detection", 24, 0.8],
        ["/", 6, 0.2],
      ],
    );
  });

  it("adds each page's own engagement across all sources", () => {
    const detail = buildSourceDetail(input());
    if (!detail.pages.available) throw new Error("expected pages");
    const home = detail.pages.rows.find((row) => row.path === "/")!;
    assert.equal(home.pageEngagementRate, 0.65);
    assert.equal(home.pageBounceRate, 0.35);
    assert.equal(home.pageAvgSessionDuration, 48);
    const click = detail.pages.rows.find((row) => row.path === "/encharge-click-detection")!;
    assert.equal(click.pageEngagementRate, null);
  });

  it("keeps a gap for a day with no stored row", () => {
    const detail = buildSourceDetail(input());
    assert.deepEqual(
      detail.daily.map((row) => row.sessions),
      [10, null, 20, null, null],
    );
    assert.equal(detail.coverage.storedDays, 2);
  });

  it("writes a plain summary with the readable name", () => {
    const detail = buildSourceDetail(input());
    assert.equal(detail.label.name, "Encharge email (warm)");
    assert.match(detail.summary[0]!, /Encharge email \(warm\) sent 30 visits over 5 days, 25% of all visits to the site/);
    assert.match(detail.summary.join(" "), /80% of these visits started on \/encharge-click-detection/);
  });

  it("passes through why landing pages are missing", () => {
    const detail = buildSourceDetail(
      input({ landings: { available: false, reason: "Traffic sources per page are not collected yet." } }),
    );
    assert.deepEqual(detail.pages, { available: false, reason: "Traffic sources per page are not collected yet." });
  });

  it("has no comparison for an all-time range", () => {
    const detail = buildSourceDetail(input({ previous: null }));
    assert.equal(detail.kpis.sessions.previous, null);
    assert.equal(detail.kpis.sessions.change, null);
  });
});
