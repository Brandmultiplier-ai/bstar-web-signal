/**
 * Extra Clarity slices: Device, Browser, Source.
 *   node scripts/probe-clarity-breakdown.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const token = envText.match(/^CLARITY_API_TOKEN=(.*)$/m)?.[1]?.trim();
if (!token) {
  console.error("CLARITY_API_TOKEN missing from .env.local");
  process.exit(1);
}

const PROJECT = "CLARITY_SHARED_PROJECT_ID";
const date = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);

async function fetchDimension(dimension) {
  const url = new URL("https://www.clarity.ms/export-data/api/v1/project-live-insights");
  url.searchParams.set("numOfDays", "3");
  url.searchParams.set("dimension1", dimension);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`${dimension} ${response.status}: ${body.slice(0, 200)}`);
  }
  return response.json();
}

function numeric(raw) {
  if (raw === undefined || raw === null || raw === "") return 0;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0;
}

function foldTraffic(metrics, fields) {
  const traffic = metrics.find((m) => m.metricName === "Traffic")?.information ?? [];
  const byKey = new Map();
  for (const row of traffic) {
    const raw =
      fields.map((field) => row[field]).find((value) => typeof value === "string" && value.trim()) ??
      "(not set)";
    const key = String(raw);
    const sessions = numeric(row.totalSessionCount);
    const users = numeric(row.distinctUserCount);
    const existing = byKey.get(key);
    if (existing) {
      existing.sessions += sessions;
      existing.users += users;
    } else {
      byKey.set(key, { key, sessions, users });
    }
  }
  return [...byKey.values()];
}

function str(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const slices = [
  { dimension: "device", api: "Device", fields: ["Device", "Name"] },
  { dimension: "browser", api: "Browser", fields: ["Browser", "Name"] },
  { dimension: "source", api: "Source", fields: ["Source", "Name"] },
  { dimension: "country", api: "Country", fields: ["Country", "Name"] },
  { dimension: "os", api: "OS", fields: ["OS", "Name"] },
];

const rows = [];
for (const slice of slices) {
  try {
    const metrics = await fetchDimension(slice.api);
    const traffic = metrics.find((m) => m.metricName === "Traffic")?.information ?? [];
    console.error(`${slice.api} keys: ${Object.keys(traffic[0] ?? {}).join(", ") || "(empty)"}`);
    for (const row of foldTraffic(metrics, slice.fields)) {
      rows.push({ ...row, dimension: slice.dimension });
    }
  } catch (error) {
    console.error(String(error.message ?? error));
  }
}

const sql =
  rows.length === 0
    ? "-- no clarity breakdowns\n"
    : `insert into public.clarity_breakdown_daily (clarity_project_id, date, dimension, key, sessions, distinct_users) values
${rows
  .map(
    (r) =>
      `(${str(PROJECT)}, '${date}'::date, ${str(r.dimension)}, ${str(r.key)}, ${r.sessions}, ${r.users})`,
  )
  .join(",\n")}
on conflict (clarity_project_id, date, dimension, key) do update set
  sessions = excluded.sessions,
  distinct_users = excluded.distinct_users;
`;

writeFileSync(new URL("../.clarity-breakdown.sql", import.meta.url), sql);
console.error(`rows: ${rows.length}`);
