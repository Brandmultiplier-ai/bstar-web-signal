import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";

import { PAGE_NOTES, pageNote } from "./page-notes";

describe("pageNote", () => {
  afterEach(() => {
    delete PAGE_NOTES.testsite;
  });

  it("returns the team's note for a configured page, whatever its trailing slash or query", () => {
    PAGE_NOTES.testsite = { "/pricing": "Linked from proposal emails." };
    assert.equal(pageNote("testsite", "/pricing"), "Linked from proposal emails.");
    assert.equal(pageNote("testsite", "/pricing/"), "Linked from proposal emails.");
    assert.equal(pageNote("testsite", "/pricing?utm_source=x"), "Linked from proposal emails.");
  });

  it("returns null when there is no note", () => {
    PAGE_NOTES.testsite = { "/pricing": "Linked from proposal emails." };
    assert.equal(pageNote("testsite", "/about"), null);
    assert.equal(pageNote("othersite", "/pricing"), null);
    assert.equal(pageNote(undefined, "/pricing"), null);
    assert.equal(pageNote("testsite", null), null);
  });

  it("keeps every configured path in the form GA4 reports", () => {
    for (const notes of Object.values(PAGE_NOTES)) {
      for (const [path, note] of Object.entries(notes)) {
        assert.ok(path.startsWith("/"), path);
        assert.ok(note.trim().length > 0, path);
      }
    }
  });
});
