import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { Site } from "../database.types";
import { describeShape, findSessionList, parseRecordings, recordingWindow } from "./clarity-recordings";

/*
 * Microsoft does not publish this response. These fixtures follow the MCP
 * server's description ("session links, duration, and user interaction
 * timelines") in a few plausible shapes; the first stored `raw` replaces them.
 */

function site(domain: string, projectId: string | null): Site {
  return {
    id: `id-${domain}`,
    slug: domain,
    domain,
    display_name: domain,
    ga4_property_id: null,
    ga4_hostname_filter: null,
    gsc_site_url: null,
    clarity_project_id: projectId,
    rb2b_enabled: false,
    is_active: true,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
  };
}

const sites = [site("brandmultiplier.ai", "k0r7x8mkc7"), site("chrisrubincreativ.com", "yv4cy3vjqc")];
const context = { projectId: "k0r7x8mkc7", sites };

describe("findSessionList", () => {
  it("finds the sessions wherever the response puts them", () => {
    assert.equal(findSessionList([{ a: 1 }])?.length, 1);
    assert.equal(findSessionList({ sessions: [{ a: 1 }, { a: 2 }] })?.length, 2);
    assert.equal(findSessionList({ data: { recordings: [{ a: 1 }] } })?.length, 1);
    assert.equal(findSessionList({ whatever: [{ a: 1 }] })?.length, 1);
    assert.equal(findSessionList({ message: "no access" }), null);
    assert.equal(findSessionList("nope"), null);
  });

  it("describes a shape by key names only", () => {
    assert.equal(describeShape({ error: "secret value", code: 1 }), "object with keys error, code");
    assert.equal(describeShape([1, 2]), "array of 2");
  });
});

describe("parseRecordings", () => {
  it("maps a session with named fields", () => {
    const { rows, listFound } = parseRecordings(
      {
        sessions: [
          {
            sessionId: "abc123",
            sessionLink: "https://clarity.microsoft.com/player/k0r7x8mkc7/abc/def",
            startTime: "2026-11-12T08:30:00Z",
            duration: 42,
            entryUrl: "https://brandmultiplier.ai/encharge-click-detection?utm_source=encharge",
            exitUrl: "https://www.brandmultiplier.ai/pricing/",
            visitedUrls: ["https://brandmultiplier.ai/encharge-click-detection", { url: "https://brandmultiplier.ai/pricing" }],
            pageCount: 2,
            clickCount: "3",
            deviceType: "PC",
            browser: "Chrome",
            country: "United States",
            referrer: "https://mail.google.com/",
          },
        ],
      },
      context,
    );
    assert.ok(listFound);
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.equal(row.session_id, "abc123");
    assert.equal(row.site_id, "id-brandmultiplier.ai");
    assert.equal(row.recording_url, "https://clarity.microsoft.com/player/k0r7x8mkc7/abc/def");
    assert.equal(row.started_at, "2026-11-12T08:30:00.000Z");
    assert.equal(row.duration_seconds, 42);
    assert.deepEqual(row.visited_paths, ["/encharge-click-detection", "/pricing"]);
    assert.equal(row.page_count, 2);
    assert.equal(row.click_count, 3);
    assert.equal(row.device, "PC");
    assert.equal(row.country, "United States");
    assert.equal(row.referrer, "https://mail.google.com/");
    assert.equal((row.raw as { sessionId: string }).sessionId, "abc123");
  });

  it("finds a replay link under an unknown key and reads other spellings", () => {
    const { rows } = parseRecordings(
      [
        {
          id: 7,
          somethingNew: "https://clarity.microsoft.com/player/k0r7x8mkc7/x/y",
          sessionStart: 1_762_936_200,
          durationMs: 61_500,
          landingPage: "https://brandmultiplier.ai/",
          pages: [{ pageUrl: "https://brandmultiplier.ai/" }, { pageUrl: "https://brandmultiplier.ai/about" }],
        },
      ],
      context,
    );
    const row = rows[0]!;
    assert.equal(row.session_id, "7");
    assert.equal(row.recording_url, "https://clarity.microsoft.com/player/k0r7x8mkc7/x/y");
    assert.equal(row.started_at, new Date(1_762_936_200_000).toISOString());
    assert.equal(row.duration_seconds, 61.5);
    assert.equal(row.page_count, 2);
    assert.deepEqual(row.visited_paths, ["/", "/about"]);
  });

  it("reads an hh:mm:ss duration", () => {
    const { rows } = parseRecordings([{ sessionId: "s", duration: "00:02:05" }], context);
    assert.equal(rows[0]!.duration_seconds, 125);
  });

  it("keeps a session it cannot fully read, keyed by a stable hash", () => {
    const first = parseRecordings([{ odd: "shape" }], context).rows[0]!;
    const again = parseRecordings([{ odd: "shape" }], context).rows[0]!;
    assert.equal(first.session_id, again.session_id);
    assert.equal(first.session_id.length, 40);
    assert.deepEqual(first.visited_paths, []);
    assert.equal(first.recording_url, null);
    assert.equal(first.site_id, "id-brandmultiplier.ai");
  });

  it("collapses a session listed twice", () => {
    const { rows } = parseRecordings({ sessions: [{ sessionId: "dup" }, { sessionId: "dup" }] }, context);
    assert.equal(rows.length, 1);
  });

  it("reports the shape when there is no session list", () => {
    const result = parseRecordings({ error: "Unauthorized" }, context);
    assert.equal(result.listFound, false);
    assert.equal(result.rows.length, 0);
    assert.equal(result.shape, "object with keys error");
  });
});

describe("recordingWindow", () => {
  it("covers one whole UTC day", () => {
    assert.deepEqual(recordingWindow("2026-11-12"), {
      start: "2026-11-12T00:00:00.000Z",
      end: "2026-11-12T23:59:59.999Z",
    });
  });
});
