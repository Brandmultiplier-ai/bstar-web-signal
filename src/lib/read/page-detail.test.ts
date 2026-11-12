import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildPageDetail,
  normalisePath,
  type PageClarityRow,
  type PageDetailInput,
  type PageGa4Row,
} from "./page-detail";

const current = { start: "2026-11-01", end: "2026-11-05" };
const previous = { start: "2026-10-27", end: "2026-10-31" };

const ga4 = (date: string, pageviews: number, sessions: number, extra: Partial<PageGa4Row> = {}): PageGa4Row => ({
  date,
  pageviews,
  sessions,
  users: sessions,
  engaged_sessions: Math.floor(sessions / 2),
  bounce_rate: 0.5,
  avg_session_duration: 60,
  ...extra,
});

const clarity = (date: string, sessions: number, scroll: number | null, rage: number | null = null): PageClarityRow => ({
  date,
  sessions,
  scroll_depth_pct: scroll,
  active_time_seconds: 30,
  rage_click_pct: rage,
  dead_click_pct: null,
  quick_back_pct: null,
  excessive_scroll_pct: null,
  script_error_pct: null,
});

const input = (over: Partial<PageDetailInput> = {}): PageDetailInput => ({
  path: "/pricing",
  current,
  previous,
  ga4: [],
  landings: [],
  clarity: [],
  keyEvents: [],
  sources: { available: false, reason: "Not collected yet" },
  forms: { available: true, rows: [] },
  visits: { available: true, rows: [] },
  ...over,
});

describe("normalisePath", () => {
  it("reduces full URLs and paths to the same key", () => {
    assert.equal(normalisePath("https://www.example.com/pricing/?utm_source=x#top"), "/pricing");
    assert.equal(normalisePath("/pricing/"), "/pricing");
    assert.equal(normalisePath("/pricing#faq"), "/pricing");
    assert.equal(normalisePath("https://example.com"), "/");
    assert.equal(normalisePath("/"), "/");
  });

  it("returns null for nothing to match", () => {
    assert.equal(normalisePath(null), null);
    assert.equal(normalisePath(""), null);
  });
});

describe("buildPageDetail", () => {
  it("totals the current window and compares with the previous one", () => {
    const out = buildPageDetail(
      input({
        ga4: [ga4("2026-11-01", 10, 8), ga4("2026-11-03", 20, 12), ga4("2026-10-28", 15, 10)],
      }),
    );
    assert.deepEqual(out.kpis.views, { current: 30, previous: 15, change: 1 });
    assert.equal(out.kpis.sessions.current, 20);
    assert.equal(out.kpis.engagementRate.current, (4 + 6) / 20);
  });

  it("weights bounce and duration by sessions", () => {
    const out = buildPageDetail(
      input({
        ga4: [
          ga4("2026-11-01", 1, 1, { bounce_rate: 1, avg_session_duration: 10 }),
          ga4("2026-11-02", 3, 3, { bounce_rate: 0, avg_session_duration: 50 }),
        ],
      }),
    );
    assert.equal(out.kpis.bounceRate.current, 0.25);
    assert.equal(out.kpis.avgSessionDuration.current, 40);
  });

  it("leaves days without a stored row empty rather than zero", () => {
    const out = buildPageDetail(input({ ga4: [ga4("2026-11-02", 5, 4)] }));
    assert.equal(out.daily.length, 5);
    assert.deepEqual(
      out.daily.map((day) => day.views),
      [null, 5, null, null, null],
    );
    assert.equal(out.coverage.ga4Days, 1);
  });

  it("reports how many days Clarity has for the page and weights its rates", () => {
    const out = buildPageDetail(
      input({ clarity: [clarity("2026-11-01", 3, 10, 0), clarity("2026-11-04", 1, 50, 100)] }),
    );
    assert.equal(out.coverage.clarityDays, 2);
    assert.equal(out.kpis.scrollDepthPct.current, 20);
    assert.equal(out.behaviour.rageClickPct, 25);
    assert.equal(out.behaviour.sessions, 4);
  });

  it("has no baseline for an all-time range", () => {
    const out = buildPageDetail(
      input({ previous: null, current: { start: "2020-01-01", end: "2026-11-05" }, ga4: [ga4("2026-11-04", 2, 2)] }),
    );
    assert.equal(out.kpis.views.previous, null);
    assert.equal(out.kpis.views.change, null);
    assert.equal(out.daily[0]?.date, "2026-11-04");
  });

  it("matches forms and companies on the page path only", () => {
    const out = buildPageDetail(
      input({
        forms: {
          available: true,
          rows: [
            { form_id: "contact", page_url: "https://www.example.com/pricing?x=1", submitted_at: "2026-11-02T10:00:00Z", received_at: "2026-11-02T10:00:01Z" },
            { form_id: "contact", page_url: "https://example.com/other", submitted_at: null, received_at: "2026-11-02T10:00:00Z" },
            { form_id: "demo", page_url: "https://example.com/pricing/", submitted_at: null, received_at: "2026-10-29T10:00:00Z" },
          ],
        },
        visits: {
          available: true,
          rows: [
            { company: "Acme", captured_url: "https://example.com/pricing", captured_at: "2026-11-03T09:00:00Z" },
            { company: "Acme", captured_url: "https://example.com/pricing", captured_at: "2026-11-04T09:00:00Z" },
            { company: null, captured_url: "https://example.com/pricing", captured_at: "2026-11-04T09:00:00Z" },
            { company: "Other", captured_url: "https://example.com/", captured_at: "2026-11-04T09:00:00Z" },
          ],
        },
      }),
    );
    assert.deepEqual(out.kpis.formSubmissions, { current: 1, previous: 1, change: 0 });
    assert.equal(out.forms.available && out.forms.byForm[0]?.name, "contact");
    assert.ok(out.companies.available);
    assert.equal(out.companies.visits, 3);
    assert.deepEqual(out.companies.rows, [{ company: "Acme", visits: 2, lastSeen: "2026-11-04T09:00:00Z" }]);
  });

  it("groups conversions by event and placement within the range", () => {
    const out = buildPageDetail(
      input({
        keyEvents: [
          { date: "2026-11-01", event_key: "form_submission", placement: "hero", count: 2 },
          { date: "2026-11-02", event_key: "form_submission", placement: "hero", count: 1 },
          { date: "2026-10-28", event_key: "gate_open", placement: "tool", count: 9 },
        ],
      }),
    );
    assert.deepEqual(out.conversions, [{ eventKey: "form_submission", placement: "hero", count: 3 }]);
  });

  it("passes through unavailable reads instead of showing zero", () => {
    const out = buildPageDetail(
      input({
        forms: { available: false, reason: "no access" },
        visits: { available: false, reason: "no rb2b" },
      }),
    );
    assert.deepEqual(out.forms, { available: false, reason: "no access" });
    assert.deepEqual(out.companies, { available: false, reason: "no rb2b" });
    assert.equal(out.kpis.formSubmissions.current, null);
    assert.deepEqual(out.sources, { available: false, reason: "Not collected yet" });
  });

  it("returns empty values for a page with nothing stored", () => {
    const out = buildPageDetail(input());
    assert.equal(out.kpis.views.current, null);
    assert.equal(out.kpis.scrollDepthPct.current, null);
    assert.equal(out.coverage.ga4Days, 0);
    assert.ok(out.daily.every((day) => day.views === null));
  });
});
