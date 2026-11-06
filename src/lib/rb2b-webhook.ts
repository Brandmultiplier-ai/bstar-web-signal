import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

const SECRET_HEADER = "x-rb2b-secret";
const MAX_BODY_BYTES = 32 * 1024;
const MAX_TEXT = 2000;

const FIELD_KEYS = {
  company: ["Company Name", "company"],
  title: ["Title", "title"],
  linkedin_url: ["LinkedIn URL", "linkedin_url"],
  captured_url: ["Captured URL", "captured_url"],
  referrer: ["Referrer", "referrer"],
  captured_at: ["Seen At", "captured_at"],
} as const;

const MAPPED_KEYS = new Set<string>(Object.values(FIELD_KEYS).flat());

export type Rb2bInsert = {
  site_id: string | null;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  captured_url: string | null;
  referrer: string | null;
  captured_at: string;
  raw: Record<string, unknown> | null;
};

export type Rb2bWriteResult = "ok" | "duplicate" | "error";

export type Rb2bDeps = {
  expectedSecret: () => string;
  resolveSiteId: (capturedUrl: string | null) => Promise<string | null>;
  insertVisitor: (row: Rb2bInsert) => Promise<Rb2bWriteResult>;
};

/**
 * Same person, same page, same instant. Matches rb2b_visitors_dedupe_idx
 * (linkedin_url, captured_at, captured_url), NULLS NOT DISTINCT.
 */
export function visitorKey(row: Pick<Rb2bInsert, "linkedin_url" | "captured_at" | "captured_url">): string {
  return [row.linkedin_url ?? "", row.captured_at, row.captured_url ?? ""].join("\u0000");
}

function digestsMatch(provided: string, expected: string): boolean {
  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

/** Header or query secret. Both are compared, and neither is logged. */
export function secretAccepted(header: string | null, query: string | null, expected: string): boolean {
  const headerOk = digestsMatch(header ?? "\u0000", expected) && Boolean(header);
  const queryOk = digestsMatch(query ?? "\u0000", expected) && Boolean(query);
  return headerOk || queryOk;
}

function querySecret(request: Request): string | null {
  try {
    return new URL(request.url).searchParams.get("secret");
  } catch {
    return null;
  }
}

function blankToNull(value: string): string | null {
  const trimmed = value.trim().slice(0, MAX_TEXT);
  return trimmed.length > 0 ? trimmed : null;
}

function readText(
  body: Record<string, unknown>,
  keys: readonly string[],
): { ok: true; value: string | null } | { ok: false } {
  let value: string | null = null;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    const raw = body[key];
    if (raw === null) continue;
    if (typeof raw !== "string") return { ok: false };
    if (value === null) value = blankToNull(raw);
  }
  return { ok: true, value };
}

function parseCapturedAt(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text) return null;
  const direct = new Date(text);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString();
  // RB2B's sample writes seconds as 56:00.00 instead of 56.00.
  const repaired = text.replace(/T(\d{2}:\d{2}:\d{2}):(\d{2}(?:\.\d+)?)/, "T$1.$2");
  const second = new Date(repaired);
  if (!Number.isNaN(second.getTime())) return second.toISOString();
  return null;
}

export function mapRb2bPayload(body: Record<string, unknown>): Rb2bInsert | "invalid" {
  const company = readText(body, FIELD_KEYS.company);
  const title = readText(body, FIELD_KEYS.title);
  const linkedin = readText(body, FIELD_KEYS.linkedin_url);
  const capturedUrl = readText(body, FIELD_KEYS.captured_url);
  const referrer = readText(body, FIELD_KEYS.referrer);
  if (!company.ok || !title.ok || !linkedin.ok || !capturedUrl.ok || !referrer.ok) return "invalid";

  let capturedAt: string | null = null;
  let sawCapturedAt = false;
  for (const key of FIELD_KEYS.captured_at) {
    if (!Object.prototype.hasOwnProperty.call(body, key)) continue;
    sawCapturedAt = true;
    const parsed = parseCapturedAt(body[key]);
    if (!parsed) return "invalid";
    if (capturedAt === null) capturedAt = parsed;
  }
  if (!sawCapturedAt || !capturedAt) return "invalid";

  const raw: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (MAPPED_KEYS.has(key)) continue;
    if (key === "secret" || key.toLowerCase() === SECRET_HEADER) continue;
    raw[key] = value;
  }

  return {
    site_id: null,
    company: company.value,
    title: title.value,
    linkedin_url: linkedin.value,
    captured_url: capturedUrl.value,
    referrer: referrer.value,
    captured_at: capturedAt,
    raw: Object.keys(raw).length > 0 ? raw : null,
  };
}

async function readBody(request: Request): Promise<string | "too_large"> {
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY_BYTES)) {
    return "too_large";
  }
  const raw = await request.text();
  if (Buffer.byteLength(raw) > MAX_BODY_BYTES) return "too_large";
  return raw;
}

function json(body: { ok: true } | { error: string }, status = 200) {
  return NextResponse.json(body, { status });
}

export async function handleRb2bWebhook(request: Request, deps: Rb2bDeps): Promise<Response> {
  let expected: string;
  try {
    expected = deps.expectedSecret();
  } catch {
    console.error("[rb2b] failed", "config");
    return json({ error: "Unavailable" }, 500);
  }

  if (!secretAccepted(request.headers.get(SECRET_HEADER), querySecret(request), expected)) {
    console.info("[rb2b] rejected", 401);
    return json({ error: "Unauthorized" }, 401);
  }

  let raw: string | "too_large";
  try {
    raw = await readBody(request);
  } catch {
    console.info("[rb2b] rejected", 400);
    return json({ error: "Invalid body" }, 400);
  }
  if (raw === "too_large") {
    console.info("[rb2b] rejected", 400);
    return json({ error: "Payload too large" }, 400);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.info("[rb2b] rejected", 400);
    return json({ error: "Invalid JSON" }, 400);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    console.info("[rb2b] rejected", 400);
    return json({ error: "Invalid body" }, 400);
  }

  const mapped = mapRb2bPayload(parsed as Record<string, unknown>);
  if (mapped === "invalid") {
    console.info("[rb2b] rejected", 400);
    return json({ error: "Invalid body" }, 400);
  }

  let siteId: string | null;
  try {
    siteId = await deps.resolveSiteId(mapped.captured_url);
  } catch {
    console.error("[rb2b] failed", "site");
    return json({ error: "Insert failed" }, 500);
  }

  const result = await deps.insertVisitor({ ...mapped, site_id: siteId });
  if (result === "error") return json({ error: "Insert failed" }, 500);

  console.info("[rb2b] stored", result === "ok" ? 1 : 0);
  return json({ ok: true });
}
