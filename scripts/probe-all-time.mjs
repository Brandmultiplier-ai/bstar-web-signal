/**
 * Historical daily totals for All time. Writes gitignored SQL.
 *
 *   node scripts/probe-all-time.mjs path/to/key.json
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { google } = require("googleapis");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/probe-all-time.mjs path/to/key.json");
  process.exit(1);
}

const key = JSON.parse(readFileSync(resolve(jsonPath), "utf8"));
const SITE_ID = "2c065254-eb11-4394-915d-c965ce04fe85";
const PROPERTY = "properties/527690219";
const GSC_SITE = "sc-domain:brandmultiplier.ai";

function todayUtc() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
function toDateString(date) {
  return date.toISOString().slice(0, 10);
}
function fromCompact(compact) {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}
function isBrandHost(hostName) {
  const host = (hostName ?? "").toLowerCase().replace(/^www\./, "");
  return host === "brandmultiplier.ai";
}

const window = { start: "2026-03-01", end: toDateString(addDays(todayUtc(), -1)) };
const ga4 = new BetaAnalyticsDataClient({
  credentials: { client_email: key.client_email, private_key: key.private_key },
});

async function runReport(request) {
  const rows = [];
  let offset = 0;
  const limit = 100_000;
  for (;;) {
    const [response] = await ga4.runReport({ ...request, limit, offset });
    const page = response.rows ?? [];
    rows.push(...page);
    offset += page.length;
    if (page.length < limit || offset >= Number(response.rowCount ?? 0)) break;
  }
  return rows;
}

function metric(row, i) {
  return Number(row.metricValues?.[i]?.value ?? 0);
}
function weighted(a, aw, b, bw) {
  const w = aw + bw;
  if (w <= 0) return a;
  return (a * aw + b * bw) / w;
}

const totalRows = await runReport({
  property: PROPERTY,
  dateRanges: [{ startDate: window.start, endDate: window.end }],
  dimensions: [{ name: "date" }, { name: "hostName" }],
  metrics: [
    { name: "sessions" },
    { name: "totalUsers" },
    { name: "screenPageViews" },
    { name: "newUsers" },
    { name: "engagedSessions" },
    { name: "bounceRate" },
    { name: "averageSessionDuration" },
  ],
});

const byDay = new Map();
for (const row of totalRows) {
  if (!isBrandHost(row.dimensionValues?.[1]?.value)) continue;
  const date = fromCompact(row.dimensionValues[0].value);
  const next = {
    site_id: SITE_ID,
    date,
    sessions: metric(row, 0),
    users: metric(row, 1),
    pageviews: metric(row, 2),
    new_users: metric(row, 3),
    engaged_sessions: metric(row, 4),
    bounce_rate: metric(row, 5),
    avg_session_duration: metric(row, 6),
  };
  const existing = byDay.get(date);
  if (!existing) {
    byDay.set(date, next);
    continue;
  }
  byDay.set(date, {
    ...existing,
    sessions: existing.sessions + next.sessions,
    users: existing.users + next.users,
    pageviews: existing.pageviews + next.pageviews,
    new_users: existing.new_users + next.new_users,
    engaged_sessions: existing.engaged_sessions + next.engaged_sessions,
    bounce_rate: weighted(existing.bounce_rate, existing.sessions, next.bounce_rate, next.sessions),
    avg_session_duration: weighted(
      existing.avg_session_duration,
      existing.sessions,
      next.avg_session_duration,
      next.sessions,
    ),
  });
}
const ga4Daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

const auth = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
await auth.authorize();
const gsc = google.searchconsole({ version: "v1", auth });

let gscDaily = [];
try {
  const response = await gsc.searchanalytics.query({
    siteUrl: GSC_SITE,
    requestBody: {
      startDate: window.start,
      endDate: window.end,
      dimensions: ["date"],
      rowLimit: 25_000,
    },
  });
  gscDaily = (response.data.rows ?? []).map((row) => ({
    site_id: SITE_ID,
    date: String(row.keys[0]),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0),
    avg_position: Number(row.position ?? 0),
  }));
} catch (error) {
  console.error(`GSC skipped: ${error.message}`);
}

function str(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function values(rows, cols) {
  return rows
    .map((row) => `(${cols.map((col) => (typeof row[col] === "number" ? row[col] : str(row[col]))).join(", ")})`)
    .join(",\n");
}
function upsert(table, rows, cols, conflict, updates) {
  if (rows.length === 0) return `-- ${table}: 0 rows\n`;
  return `insert into public.${table} (${cols.join(", ")}) values\n${values(rows, cols)}
on conflict (${conflict}) do update set
${updates.map((c) => `  ${c} = excluded.${c}`).join(",\n")};\n`;
}

const sql = [
  upsert(
    "ga4_daily",
    ga4Daily,
    [
      "site_id",
      "date",
      "sessions",
      "users",
      "pageviews",
      "new_users",
      "engaged_sessions",
      "bounce_rate",
      "avg_session_duration",
    ],
    "site_id, date",
    ["sessions", "users", "pageviews", "new_users", "engaged_sessions", "bounce_rate", "avg_session_duration"],
  ),
  upsert("gsc_daily", gscDaily, ["site_id", "date", "clicks", "impressions", "ctr", "avg_position"], "site_id, date", [
    "clicks",
    "impressions",
    "ctr",
    "avg_position",
  ]),
  `insert into public.ingestion_runs (source, status, started_at, finished_at, window_start, window_end, rows_written)
values ('ga4', 'success', now(), now(), '${window.start}'::date, '${window.end}'::date, ${ga4Daily.length});
`,
  gscDaily.length > 0
    ? `insert into public.ingestion_runs (source, status, started_at, finished_at, window_start, window_end, rows_written)
values ('gsc', 'success', now(), now(), '${window.start}'::date, '${window.end}'::date, ${gscDaily.length});
`
    : "",
].join("\n");

writeFileSync(new URL("../.all-time-upsert.sql", import.meta.url), sql);
console.error(
  JSON.stringify(
    {
      window,
      ga4_daily: ga4Daily.length,
      ga4_sessions: ga4Daily.reduce((sum, row) => sum + row.sessions, 0),
      gsc_daily: gscDaily.length,
      gsc_clicks: gscDaily.reduce((sum, row) => sum + row.clicks, 0),
      gsc_impressions: gscDaily.reduce((sum, row) => sum + row.impressions, 0),
    },
    null,
    2,
  ),
);
