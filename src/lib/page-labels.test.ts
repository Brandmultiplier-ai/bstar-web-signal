import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PAGE_LABELS, pageLabel } from "./page-labels";

const FLYWHEEL = "/blog/the-narrative-flywheel-driving-continuous-engagement";

describe("pageLabel", () => {
  it("derives a label from the last segment of the path", () => {
    assert.equal(
      pageLabel("brandmultiplier", FLYWHEEL)?.label,
      "the narrative flywheel driving continuous engagement",
    );
    assert.equal(pageLabel("brandmultiplier", "/")?.label, "Home");
  });

  it("ignores a trailing slash, query string and hash", () => {
    const expected = "the narrative flywheel driving continuous engagement";
    assert.equal(pageLabel("brandmultiplier", `${FLYWHEEL}/`)?.label, expected);
    assert.equal(pageLabel("brandmultiplier", `${FLYWHEEL}?utm_source=x`)?.label, expected);
    assert.equal(pageLabel("brandmultiplier", `${FLYWHEEL}#top`)?.label, expected);
  });

  it("uses the same path label on every site when none is configured", () => {
    assert.equal(pageLabel("chrisrubin", FLYWHEEL)?.label, pageLabel("brandmultiplier", FLYWHEEL)?.label);
    assert.equal(pageLabel(undefined, FLYWHEEL)?.label, "the narrative flywheel driving continuous engagement");
    assert.equal(pageLabel("brandmultiplier", null), null);
  });

  it("keeps every configured path in the form GA4 reports", () => {
    for (const labels of Object.values(PAGE_LABELS)) {
      for (const [path, label] of Object.entries(labels)) {
        assert.ok(path.startsWith("/"), path);
        assert.ok(label.label.trim().length > 0, path);
      }
    }
  });
});
