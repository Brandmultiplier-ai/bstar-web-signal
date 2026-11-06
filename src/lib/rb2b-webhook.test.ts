import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { handleRb2bWebhook, visitorKey, type Rb2bInsert } from "./rb2b-webhook";

const SECRET = "test-webhook-secret";

const payload = {
  "LinkedIn URL": "https://www.linkedin.com/in/fake-visitor",
  "First Name": "Test",
  "Last Name": "Visitor",
  Title: "Example Title",
  "Company Name": "Example Co",
  "Full Name": "Test Visitor",
  Name: "Test Visitor",
  Email: "visitor@example.com",
  "Business Email": "visitor@example.com",
  "Personal Email": "home@example.com",
  "Work Email": "work@example.com",
  "Contact Email": "desk@example.com",
  username: "fake-visitor",
  "Captured URL": "https://brandmultiplier.ai/pricing",
  Referrer: "https://example.com/from",
  "Seen At": "2026-01-02T03:04:05.000Z",
  Website: "https://example.com",
  Industry: "Example Industry",
  City: "Example City",
  Tags: "Example Tag",
  "Employee Count": "1-10",
};

const IDENTITY_KEYS = [
  "First Name",
  "Last Name",
  "Full Name",
  "Name",
  "Email",
  "Business Email",
  "Personal Email",
  "Work Email",
  "Contact Email",
  "username",
];

function memoryStore() {
  const rows: Rb2bInsert[] = [];
  return {
    rows,
    async insertVisitor(row: Rb2bInsert) {
      if (rows.some((existing) => visitorKey(existing) === visitorKey(row))) return "duplicate" as const;
      rows.push(row);
      return "ok" as const;
    },
  };
}

function post(body: string, init?: { secret?: string | null; query?: boolean }) {
  const secret = init?.secret === undefined ? SECRET : init.secret;
  const url = init?.query
    ? `https://dashboard.example/api/webhooks/rb2b?secret=${encodeURIComponent(secret ?? "")}`
    : "https://dashboard.example/api/webhooks/rb2b";
  const headers = new Headers({ "content-type": "application/json" });
  if (!init?.query && secret) headers.set("x-rb2b-secret", secret);
  return new Request(url, { method: "POST", headers, body });
}

describe("rb2b webhook", () => {
  it("rejects a missing or wrong secret", async () => {
    const store = memoryStore();
    const deps = {
      expectedSecret: () => SECRET,
      resolveSiteId: async () => "site-1",
      insertVisitor: store.insertVisitor,
    };

    const missing = await handleRb2bWebhook(post("{}", { secret: null }), deps);
    assert.equal(missing.status, 401);
    const wrong = await handleRb2bWebhook(post("{}", { secret: "nope" }), deps);
    assert.equal(wrong.status, 401);
    assert.equal(store.rows.length, 0);
  });

  it("writes one row for a valid payload and ignores the repeat", async () => {
    const store = memoryStore();
    const deps = {
      expectedSecret: () => SECRET,
      resolveSiteId: async () => "site-1",
      insertVisitor: store.insertVisitor,
    };
    const body = JSON.stringify(payload);

    const first = await handleRb2bWebhook(post(body), deps);
    const second = await handleRb2bWebhook(post(body), deps);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { ok: true });
    assert.equal(second.status, 200);
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0]?.company, "Example Co");
    assert.equal(store.rows[0]?.title, "Example Title");
    assert.equal(store.rows[0]?.linkedin_url, "https://www.linkedin.com/in/fake-visitor");
    assert.equal(store.rows[0]?.captured_url, "https://brandmultiplier.ai/pricing");
    assert.equal(store.rows[0]?.referrer, "https://example.com/from");
    assert.equal(store.rows[0]?.captured_at, "2026-01-02T03:04:05.000Z");
    assert.equal(store.rows[0]?.site_id, "site-1");
    const raw = store.rows[0]?.raw as Record<string, unknown>;
    for (const key of IDENTITY_KEYS) assert.equal(raw[key], undefined);
    assert.equal(raw.Website, "https://example.com");
    assert.equal(raw.Industry, "Example Industry");
    assert.equal(raw.City, "Example City");
    assert.equal(raw.Tags, "Example Tag");
    assert.equal(raw["Employee Count"], "1-10");
  });

  it("keeps company and other fields while dropping name and email from raw", async () => {
    const store = memoryStore();
    const response = await handleRb2bWebhook(post(JSON.stringify(payload)), {
      expectedSecret: () => SECRET,
      resolveSiteId: async () => "site-1",
      insertVisitor: store.insertVisitor,
    });
    assert.equal(response.status, 200);
    const row = store.rows[0];
    assert.equal(row?.company, "Example Co");
    assert.equal(row?.title, "Example Title");
    assert.equal(row?.linkedin_url, "https://www.linkedin.com/in/fake-visitor");
    assert.equal(row?.captured_url, "https://brandmultiplier.ai/pricing");
    assert.equal(row?.referrer, "https://example.com/from");
    assert.equal(row?.captured_at, "2026-01-02T03:04:05.000Z");
    const raw = row?.raw as Record<string, unknown>;
    for (const key of IDENTITY_KEYS) assert.equal(Object.hasOwn(raw, key), false);
    assert.deepEqual(raw, {
      Website: "https://example.com",
      Industry: "Example Industry",
      City: "Example City",
      Tags: "Example Tag",
      "Employee Count": "1-10",
    });
    const stored = JSON.stringify(row);
    assert.equal(stored.includes("visitor@example.com"), false);
    assert.equal(stored.includes("home@example.com"), false);
    assert.equal(stored.includes("work@example.com"), false);
    assert.equal(stored.includes("desk@example.com"), false);
    assert.equal(stored.includes("Test Visitor"), false);
  });

  it("accepts the secret on the query string", async () => {
    const store = memoryStore();
    const response = await handleRb2bWebhook(post(JSON.stringify(payload), { query: true }), {
      expectedSecret: () => SECRET,
      resolveSiteId: async () => null,
      insertVisitor: store.insertVisitor,
    });
    assert.equal(response.status, 200);
    assert.equal(store.rows.length, 1);
    assert.equal(store.rows[0]?.site_id, null);
  });

  it("returns 400 for malformed JSON", async () => {
    const store = memoryStore();
    const response = await handleRb2bWebhook(post("{"), {
      expectedSecret: () => SECRET,
      resolveSiteId: async () => null,
      insertVisitor: store.insertVisitor,
    });
    assert.equal(response.status, 400);
    assert.equal(store.rows.length, 0);
  });
});
