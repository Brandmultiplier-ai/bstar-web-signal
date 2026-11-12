import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sourceLabel } from "./source-labels";

describe("sourceLabel", () => {
  it("names the stored sources in plain English", () => {
    assert.equal(sourceLabel("(direct)", "(none)").name, "Direct or unknown");
    assert.equal(sourceLabel("encharge", "warm").name, "Encharge email (warm)");
    assert.equal(sourceLabel("google", "organic").name, "Google search");
    assert.equal(sourceLabel("bing", "organic").name, "Bing search");
    assert.equal(sourceLabel("chatgpt.com", "organic").name, "ChatGPT");
    assert.equal(sourceLabel("chatgpt.com", "ai-assistant").name, "ChatGPT");
    assert.equal(sourceLabel("linkedin.com", "referral").name, "LinkedIn");
    assert.equal(sourceLabel("linkedin", "dm").name, "LinkedIn message");
    assert.equal(sourceLabel("m.facebook.com", "referral").name, "Facebook");
    assert.equal(sourceLabel("fb", "paid").name, "Facebook ads");
    assert.equal(sourceLabel("ig", "paid").name, "Instagram ads");
  });

  it("gives each source a kind", () => {
    assert.equal(sourceLabel("encharge", "warm").kind, "email");
    assert.equal(sourceLabel("gemini.google.com", "ai-assistant").kind, "ai");
    assert.equal(sourceLabel("cn.bing.com", "referral").kind, "search");
    assert.equal(sourceLabel("brandmultiplier", "internal").kind, "internal");
    assert.equal(sourceLabel("(not set)", "(not set)").kind, "unknown");
  });

  it("marks development and preview traffic as testing", () => {
    for (const source of ["localhost:3000", "crc-site.vercel.app", "tagassistant.google.com", "qa_li_tag"]) {
      assert.equal(sourceLabel(source, "referral").kind, "testing", source);
    }
  });

  it("falls back to the raw values for anything unrecognised", () => {
    assert.equal(sourceLabel("b2becosystem.com", "referral").name, "b2becosystem.com");
    assert.equal(sourceLabel("b2becosystem.com", "referral").kind, "referral");
    assert.equal(sourceLabel("partner", "launch").name, "partner / launch");
    assert.equal(sourceLabel("partner", "launch").kind, "unknown");
  });

  it("always keeps the raw pair", () => {
    assert.equal(sourceLabel("encharge", "warm").raw, "encharge / warm");
  });
});
