import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { decodeEntities, parsePageMeta, pickPaths } from "./page-meta";

const PAGE = `<!doctype html><html><head>
<meta charset="utf-8">
<title>Pricing &amp; Plans | Brand Multiplier</title>
<meta property="og:description" content="OG text">
<meta content="How we price  the &quot;Narrative&quot; engagement." name="description">
<link rel="canonical" href="https://brandmultiplier.ai/pricing">
<script>var h1 = "<h1>not this</h1>";</script>
</head><body><header><h1 class="hero">Pick a <em>plan</em></h1></header><h1>Second</h1></body></html>`;

describe("parsePageMeta", () => {
  it("reads title, description, first heading and canonical URL", () => {
    assert.deepEqual(parsePageMeta(PAGE), {
      title: "Pricing & Plans | Brand Multiplier",
      description: 'How we price the "Narrative" engagement.',
      h1: "Pick a plan",
      canonical_url: "https://brandmultiplier.ai/pricing",
    });
  });

  it("falls back to Open Graph tags", () => {
    const html = `<head><meta property="og:title" content="OG title"><meta property='og:description' content='From OG'></head>`;
    const meta = parsePageMeta(html);
    assert.equal(meta.title, "OG title");
    assert.equal(meta.description, "From OG");
  });

  it("returns nulls for a page with nothing to read", () => {
    assert.deepEqual(parsePageMeta("<html><body>Redirecting…</body></html>"), {
      title: null,
      description: null,
      h1: null,
      canonical_url: null,
    });
  });

  it("caps very long text", () => {
    const meta = parsePageMeta(`<title>${"a".repeat(900)}</title>`);
    assert.equal(meta.title?.length, 500);
    assert.ok(meta.title?.endsWith("…"));
  });
});

describe("decodeEntities", () => {
  it("decodes named and numeric entities", () => {
    assert.equal(decodeEntities("Tom&#39;s &#x2014; &rsquo;ok&nbsp;&bogus;"), "Tom's — ’ok\u00a0&bogus;".replace("\u00a0", " "));
  });
});

describe("pickPaths", () => {
  it("keeps real paths, sums repeats and ranks by views", () => {
    assert.deepEqual(
      pickPaths(
        [
          { page_path: "/a", pageviews: 3 },
          { page_path: "/b", pageviews: 5 },
          { page_path: "/a", pageviews: 4 },
          { page_path: "(not set)", pageviews: 99 },
          { page_path: "//evil.example", pageviews: 99 },
          { page_path: "/with space", pageviews: 99 },
        ],
        5,
      ),
      ["/a", "/b"],
    );
    assert.deepEqual(pickPaths([{ page_path: "/a", pageviews: 1 }, { page_path: "/b", pageviews: 2 }], 1), ["/b"]);
  });
});
