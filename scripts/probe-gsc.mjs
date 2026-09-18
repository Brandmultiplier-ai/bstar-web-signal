/**
 * Pulls Search Console into SQL upserts until SUPABASE_SERVICE_ROLE_KEY is set.
 *
 *   node scripts/probe-gsc.mjs path/to/key.json
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { google } = require("googleapis");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/probe-gsc.mjs path/to/key.json");
  process.exit(1);
}

const key = JSON.parse(readFileSync(resolve(jsonPath), "utf8"));
const GSC_SITE = process.argv[3] ?? "sc-domain:brandmultiplier.ai";
const SITE_ID = "2c065254-eb11-4394-915d-c965ce04fe85";
const TOP_QUERIES = 25;

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

const end = addDays(todayUtc(), -1);
const start = addDays(end, -9);
const window = { start: toDateString(start), end: toDateString(end) };

const auth = new google.auth.JWT({
  email: key.client_email,
  key: key.private_key,
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
await auth.authorize();
const gsc = google.searchconsole({ version: "v1", auth });

async function withRetry(label, fn) {
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const code = error.code || error.status;
      console.error(`${label} attempt ${attempt}: ${code} ${error.message}`);
      if (code !== 403 && code !== 429) throw error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 4000 * attempt));
    }
  }
  throw lastError;
}

const listed = await withRetry("sites.list", async () => (await gsc.sites.list()).data.siteEntry ?? []);
console.error(
  JSON.stringify(
    {
      listed: listed.map((s) => ({ siteUrl: s.siteUrl, permissionLevel: s.permissionLevel })),
      using: GSC_SITE,
      window,
    },
    null,
    2,
  ),
);

async function queryAnalytics(body) {
  const rows = [];
  let startRow = 0;
  const rowLimit = 25_000;
  for (;;) {
    const response = await gsc.searchanalytics.query({
      siteUrl: GSC_SITE,
      requestBody: { ...body, rowLimit, startRow },
    });
    const page = response.data.rows ?? [];
    rows.push(...page);
    if (page.length < rowLimit) break;
    startRow += page.length;
  }
  return rows;
}

const dailyRows = await withRetry("daily", () =>
  queryAnalytics({
    startDate: window.start,
    endDate: window.end,
    dimensions: ["date"],
  }),
);
const gscDaily = dailyRows.map((row) => ({
  site_id: SITE_ID,
  date: String(row.keys[0]),
  clicks: Number(row.clicks ?? 0),
  impressions: Number(row.impressions ?? 0),
  ctr: Number(row.ctr ?? 0),
  avg_position: Number(row.position ?? 0),
}));

const queryRows = await withRetry("queries", () =>
  queryAnalytics({
    startDate: window.start,
    endDate: window.end,
    dimensions: ["date", "query"],
  }),
);
const mapped = queryRows.map((row) => ({
  site_id: SITE_ID,
  date: String(row.keys[0]),
  query: String(row.keys[1]),
  clicks: Number(row.clicks ?? 0),
  impressions: Number(row.impressions ?? 0),
  ctr: Number(row.ctr ?? 0),
  avg_position: Number(row.position ?? 0),
}));
const byDay = new Map();
for (const row of mapped) {
  const bucket = byDay.get(row.date);
  if (bucket) bucket.push(row);
  else byDay.set(row.date, [row]);
}
const gscQueries = [];
for (const bucket of byDay.values()) {
  bucket.sort((a, b) => b.impressions - a.impressions);
  gscQueries.push(...bucket.slice(0, TOP_QUERIES));
}

let gscIndex = [];
try {
  const sitemaps = (await gsc.sitemaps.list({ siteUrl: GSC_SITE })).data.sitemap ?? [];
  if (sitemaps.length > 0) {
    let submitted = 0;
    let indexed = 0;
    for (const sitemap of sitemaps) {
      for (const contents of sitemap.contents ?? []) {
        submitted += Number(contents.submitted ?? 0);
        indexed += Number(contents.indexed ?? 0);
      }
    }
    gscIndex = [
      {
        site_id: SITE_ID,
        date: toDateString(todayUtc()),
        indexed_count: indexed,
        not_indexed_count: Math.max(submitted - indexed, 0),
      },
    ];
  }
  console.error(`sitemaps: ${sitemaps.length}`);
} catch (error) {
  console.error(`sitemaps skipped: ${error.message}`);
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
  upsert("gsc_daily", gscDaily, ["site_id", "date", "clicks", "impressions", "ctr", "avg_position"], "site_id, date", [
    "clicks",
    "impressions",
    "ctr",
    "avg_position",
  ]),
  upsert(
    "gsc_query_daily",
    gscQueries,
    ["site_id", "date", "query", "clicks", "impressions", "ctr", "avg_position"],
    "site_id, date, query",
    ["clicks", "impressions", "ctr", "avg_position"],
  ),
  upsert(
    "gsc_index_status",
    gscIndex,
    ["site_id", "date", "indexed_count", "not_indexed_count"],
    "site_id, date",
    ["indexed_count", "not_indexed_count"],
  ),
  `insert into public.ingestion_runs (source, status, started_at, finished_at, window_start, window_end, rows_written)
values ('gsc', 'success', now(), now(), '${window.start}'::date, '${window.end}'::date, ${gscDaily.length + gscQueries.length + gscIndex.length});
`,
].join("\n");

writeFileSync(new URL("../.gsc-upsert.sql", import.meta.url), sql);
console.error(
  JSON.stringify(
    {
      window,
      gsc_daily: gscDaily.length,
      gsc_query_daily: gscQueries.length,
      gsc_index_status: gscIndex.length,
      clicks: gscDaily.reduce((sum, row) => sum + row.clicks, 0),
      impressions: gscDaily.reduce((sum, row) => sum + row.impressions, 0),
    },
    null,
    2,
  ),
);
