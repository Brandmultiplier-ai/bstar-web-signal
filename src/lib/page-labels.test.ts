import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { PAGE_LABELS, pageLabel } from "./page-labels";

const FLYWHEEL = "/blog/the-narrative-flywheel-driving-continuous-engagement";

describe("pageLabel", () => {
  it("finds a label by site and path", () => {
    assert.equal(pageLabel("brandmultiplier", FLYWHEEL)?.label, "Flywheel article");
  });

  it("ignores a trailing slash, query string and hash", () => {
    assert.ok(pageLabel("brandmultiplier", `${FLYWHEEL}/`));
    assert.ok(pageLabel("brandmultiplier", `${FLYWHEEL}?utm_source=x`));
    assert.ok(pageLabel("brandmultiplier", `${FLYWHEEL}#top`));
  });

  it("does not leak a label to another site or page", () => {
    assert.equal(pageLabel("chrisrubin", FLYWHEEL), null);
    assert.equal(pageLabel("brandmultiplier", "/"), null);
    assert.equal(pageLabel(undefined, FLYWHEEL), null);
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
