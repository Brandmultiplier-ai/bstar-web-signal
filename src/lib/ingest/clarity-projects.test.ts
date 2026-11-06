import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ClarityDimension } from "../clients/clarity";
import type { Site } from "../database.types";
import { CLARITY_PULL_DIMENSIONS, collectClarityProjects } from "./clarity-projects";

const BM_TOKEN = "token-for-brandmultiplier";
const CRC_TOKEN = "token-for-crc";

function site(domain: string, projectId: string | null): Site {
  return {
    id: domain,
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

const brandmultiplier = site("brandmultiplier.ai", "k0r7x8mkc7");
const crc = site("chrisrubincreativ.com", "yv4cy3vjqc");

function tokens(overrides?: Record<string, string | null | undefined>) {
  const values: Record<string, string | null | undefined> = {
    CLARITY_API_TOKEN: BM_TOKEN,
    CLARITY_API_TOKEN_CRC: CRC_TOKEN,
    ...overrides,
  };
  return (name: string) => values[name];
}

describe("clarity projects", () => {
  it("pulls a configured project with that project's token", async () => {
    const calls: Array<{ token: string; dimensions: ClarityDimension[] }> = [];
    const result = await collectClarityProjects({
      sites: [brandmultiplier],
      date: "2026-11-06",
      readEnv: tokens(),
      fetchInsights: async (token, dimensions) => {
        calls.push({ token, dimensions });
        return [];
      },
    });

    assert.equal(result.ok, true);
    assert.deepEqual(
      calls.map((call) => call.token),
      CLARITY_PULL_DIMENSIONS.map(() => BM_TOKEN),
    );
    assert.deepEqual(
      calls.map((call) => call.dimensions[0]),
      CLARITY_PULL_DIMENSIONS,
    );
    assert.equal(result.projects[0]?.projectId, "k0r7x8mkc7");
  });

  it("skips a project whose token is empty or missing and names it", async () => {
    const calls: string[] = [];
    const fetchInsights = async (token: string) => {
      calls.push(token);
      return [];
    };

    const empty = await collectClarityProjects({
      sites: [crc],
      date: "2026-11-06",
      readEnv: tokens({ CLARITY_API_TOKEN_CRC: "" }),
      fetchInsights,
    });
    const missing = await collectClarityProjects({
      sites: [crc],
      date: "2026-11-06",
      readEnv: tokens({ CLARITY_API_TOKEN_CRC: undefined }),
      fetchInsights,
    });

    assert.equal(empty.ok, true);
    assert.equal(missing.ok, true);
    assert.match(empty.note ?? "", /chrisrubincreativ.com skipped: no Clarity token configured/);
    assert.match(missing.note ?? "", /chrisrubincreativ.com skipped: no Clarity token configured/);
    assert.equal(calls.length, 0);
  });

  it("keeps going when one project fails and names that domain on a successful run", async () => {
    const calls: Array<{ token: string; dimensions: ClarityDimension[] }> = [];
    const result = await collectClarityProjects({
      sites: [crc, brandmultiplier],
      date: "2026-11-06",
      readEnv: tokens(),
      fetchInsights: async (token, dimensions) => {
        calls.push({ token, dimensions });
        if (token === CRC_TOKEN) throw new Error("upstream-failed bearer should-not-leak");
        return [];
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.message, null);
    assert.match(result.note ?? "", /Clarity failed for chrisrubincreativ.com/);
    assert.equal((result.note ?? "").includes("brandmultiplier.ai"), false);
    assert.equal((result.note ?? "").includes("should-not-leak"), false);
    assert.equal(calls.filter((call) => call.token === CRC_TOKEN).length, 1);
    assert.deepEqual(
      calls.filter((call) => call.token === BM_TOKEN).map((call) => call.dimensions[0]),
      CLARITY_PULL_DIMENSIONS,
    );
  });

  it("makes the run an error when every project fails", async () => {
    const result = await collectClarityProjects({
      sites: [crc, brandmultiplier],
      date: "2026-11-06",
      readEnv: tokens(),
      fetchInsights: async () => {
        throw new Error("upstream-failed");
      },
    });

    assert.equal(result.ok, false);
    assert.match(result.message ?? "", /Clarity failed for chrisrubincreativ.com, brandmultiplier.ai/);
    assert.equal((result.message ?? "").includes("upstream-failed"), false);
  });
});
