import { createHash, timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const SECRET_HEADER = "x-capture-secret";
/** Accepted fields are a few short strings; anything larger is not a capture. */
const MAX_BODY_BYTES = 16 * 1024;
const MAX_TEXT = 500;

const FORM_IDS = new Set(["final_cta", "storylock_tax", "library_optin"]);

const TEXT_FIELDS = [
  "intent",
  "page_url",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
] as const;

type TextField = (typeof TEXT_FIELDS)[number];

/**
 * Middleware skips /api/webhooks, so this secret is the only authentication.
 * SHA-256 digests are fixed length, which keeps the comparison constant time
 * and avoids leaking the secret length.
 */
function isAuthorized(request: Request): boolean {
  const provided = request.headers.get(SECRET_HEADER);
  if (!provided) return false;

  const providedDigest = createHash("sha256").update(provided).digest();
  const expectedDigest = createHash("sha256").update(env.captureWebhookSecret()).digest();
  return timingSafeEqual(providedDigest, expectedDigest);
}

function hostnameOf(pageUrl: string | null): string | null {
  if (!pageUrl) return null;
  try {
    return new URL(pageUrl).hostname || null;
  } catch {
    return null;
  }
}

function parseSubmittedAt(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date().toISOString();
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

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let raw: string | "too_large";
  try {
    raw = await readBody(request);
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (raw === "too_large") {
    return NextResponse.json({ error: "Payload too large" }, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const body = parsed as Record<string, unknown>;
  const formId = body.form_id;
  if (typeof formId !== "string" || !FORM_IDS.has(formId)) {
    return NextResponse.json({ error: "Invalid form_id" }, { status: 400 });
  }

  const fields = {} as Record<TextField, string | null>;
  for (const key of TEXT_FIELDS) {
    const value = body[key];
    if (value === undefined || value === null) {
      fields[key] = null;
      continue;
    }
    if (typeof value !== "string") {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    fields[key] = value.slice(0, MAX_TEXT);
  }

  const { error } = await createAdminClient()
    .from("form_captures")
    .insert({
      form_id: formId,
      intent: fields.intent,
      page_url: fields.page_url,
      site_domain: hostnameOf(fields.page_url),
      utm_source: fields.utm_source,
      utm_medium: fields.utm_medium,
      utm_campaign: fields.utm_campaign,
      utm_content: fields.utm_content,
      submitted_at: parseSubmittedAt(body.submitted_at),
    });

  if (error) {
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
