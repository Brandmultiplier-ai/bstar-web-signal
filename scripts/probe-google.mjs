/**
 * Pulls 10 days of GA4 + Search Console and writes SQL upserts.
 * Same pattern as scripts/clarity-to-sql.mjs: apply the SQL through MCP
 * until SUPABASE_SERVICE_ROLE_KEY is in .env.local.
 *
 *   node scripts/probe-google.mjs path/to/key.json
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { BetaAnalyticsDataClient } = require("@google-analytics/data");
const { google } = require("googleapis");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/probe-google.mjs path/to/key.json");
  process.exit(1);
}

const key = JSON.parse(readFileSync(resolve(jsonPath), "utf8"));
const credentials = {
  client_email: key.client_email,
  private_key: key.private_key,
};

const PROPERTY_ID = "527690219";
const GSC_SITE = "sc-domain:brandmultiplier.ai";
const TOP_PAGES = 50;
const TOP_SOURCES = 50;
const TOP_QUERIES = 25;

const SITES = {
  "brandmultiplier.ai": "2c065254-eb11-4394-915d-c965ce04fe85",
  "weservefounders.com": "13d3aac8-0b3a-40e4-a06a-95b9f678691f",
};

const EVENT_NAME_TO_KEY = {
  calendly_outbound_click: "calendly_outbound_click",
  form_submit: "form_submission",
  calculator_completion: "calculator_completion",
  gate_open: "gate_open",
  vsl_play: "vsl_play",
};

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
function fromCompactDate(compact) {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

const end = addDays(todayUtc(), -1);
const start = addDays(end, -9);
const window = { start: toDateString(start), end: toDateString(end) };

function resolveSiteId(hostName) {
  const host = (hostName ?? "").toLowerCase().replace(/^www\./, "");
  return SITES[host] ?? null;
}

function metric(row, index) {
  return Number(row.metricValues?.[index]?.value ?? 0);
}
function dimension(row, index) {
  const value = row.dimensionValues?.[index]?.value;
  return value && value.length > 0 ? value : "(not set)";
}

function foldByKey(rows, keyOf, merge) {
  const byKey = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = byKey.get(key);
    byKey.set(key, existing ? merge(existing, row) : row);
  }
  return [...byKey.values()];
}

function keepTopPerSiteDay(rows, weight, limit) {
  const buckets = new Map();
  for (const row of rows) {
    const key = `${row.site_id}|${row.date}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }
  const kept = [];
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => weight(b) - weight(a));
    kept.push(...bucket.slice(0, limit));
  }
  return kept;
}

async function runReport(client, request) {
  const rows = [];
  let offset = 0;
  const limit = 100_000;
  for (;;) {
    const [response] = await client.runReport({ ...request, limit, offset });
    const page = response.rows ?? [];
    rows.push(...page);
    offset += page.length;
    if (page.length < limit || offset >= Number(response.rowCount ?? 0)) break;
  }
  return rows;
}

const ga4 = new BetaAnalyticsDataClient({ credentials });
const property = `properties/${PROPERTY_ID}`;
const dateRanges = [{ startDate: window.start, endDate: window.end }];

console.error(`GA4 window ${window.start} → ${window.end}`);

const totalsRows = await runReport(ga4, {
  property,
  dateRanges,
  dimensions: [{ name: "date" }, { name: "hostName" }],
  metrics: [{ name: "sessions" }, { name: "totalUsers" }, { name: "screenPageViews" }],
});

const hosts = new Map();
for (const row of totalsRows) {
  const host = dimension(row, 1);
  hosts.set(host, (hosts.get(host) ?? 0) + metric(row, 0));
}
console.error(
  `GA4 hosts: ${[...hosts.entries()].map(([h, n]) => `${h}=${n}`).join(", ") || "(none)"}`,
);

const daily = foldByKey(
  totalsRows.flatMap((row) => {
    const site_id = resolveSiteId(row.dimensionValues?.[1]?.value);
    if (!site_id) return [];
    return [
      {
        site_id,
        date: fromCompactDate(dimension(row, 0)),
        sessions: metric(row, 0),
        users: metric(row, 1),
        pageviews: metric(row, 2),
      },
    ];
  }),
  (r) => `${r.site_id}|${r.date}`,
  (a, b) => ({
    ...a,
    sessions: a.sessions + b.sessions,
    users: a.users + b.users,
    pageviews: a.pageviews + b.pageviews,
  }),
);

const pageRows = await runReport(ga4, {
  property,
  dateRanges,
  dimensions: [{ name: "date" }, { name: "hostName" }, { name: "pagePath" }],
  metrics: [{ name: "screenPageViews" }, { name: "sessions" }],
  orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
});

const pages = keepTopPerSiteDay(
  foldByKey(
    pageRows.flatMap((row) => {
      const site_id = resolveSiteId(row.dimensionValues?.[1]?.value);
      if (!site_id) return [];
      return [
        {
          site_id,
          date: fromCompactDate(dimension(row, 0)),
          page_path: dimension(row, 2),
          pageviews: metric(row, 0),
          sessions: metric(row, 1),
        },
      ];
    }),
    (r) => `${r.site_id}|${r.date}|${r.page_path}`,
    (a, b) => ({ ...a, pageviews: a.pageviews + b.pageviews, sessions: a.sessions + b.sessions }),
  ),
  (r) => r.pageviews,
  TOP_PAGES,
);

const sourceRows = await runReport(ga4, {
  property,
  dateRanges,
  dimensions: [
    { name: "date" },
    { name: "hostName" },
    { name: "sessionSource" },
    { name: "sessionMedium" },
  ],
  metrics: [{ name: "sessions" }, { name: "totalUsers" }],
  orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
});

const sources = keepTopPerSiteDay(
  foldByKey(
    sourceRows.flatMap((row) => {
      const site_id = resolveSiteId(row.dimensionValues?.[1]?.value);
      if (!site_id) return [];
      return [
        {
          site_id,
          date: fromCompactDate(dimension(row, 0)),
          source: dimension(row, 2),
          medium: dimension(row, 3),
          sessions: metric(row, 0),
          users: metric(row, 1),
        },
      ];
    }),
    (r) => `${r.site_id}|${r.date}|${r.source}|${r.medium}`,
    (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
  ),
  (r) => r.sessions,
  TOP_SOURCES,
);

const countryRows = await runReport(ga4, {
  property,
  dateRanges,
  dimensions: [{ name: "date" }, { name: "hostName" }, { name: "countryId" }, { name: "country" }],
  metrics: [{ name: "sessions" }, { name: "totalUsers" }],
});

const countries = foldByKey(
  countryRows.flatMap((row) => {
    const site_id = resolveSiteId(row.dimensionValues?.[1]?.value);
    if (!site_id) return [];
    const code = (row.dimensionValues?.[2]?.value ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) return [];
    return [
      {
        site_id,
        date: fromCompactDate(dimension(row, 0)),
        country_code: code,
        country_name: dimension(row, 3),
        sessions: metric(row, 0),
        users: metric(row, 1),
      },
    ];
  }),
  (r) => `${r.site_id}|${r.date}|${r.country_code}`,
  (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
);

let keyEvents = [];
try {
  const eventRows = await runReport(ga4, {
    property,
    dateRanges,
    dimensions: [
      { name: "date" },
      { name: "hostName" },
      { name: "eventName" },
      { name: "pagePath" },
      { name: "customEvent:placement" },
    ],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: Object.keys(EVENT_NAME_TO_KEY), caseSensitive: false },
      },
    },
  });
  keyEvents = foldByKey(
    eventRows.flatMap((row) => {
      const site_id = resolveSiteId(row.dimensionValues?.[1]?.value);
      if (!site_id) return [];
      const eventKey = EVENT_NAME_TO_KEY[dimension(row, 2)];
      if (!eventKey) return [];
      return [
        {
          site_id,
          date: fromCompactDate(dimension(row, 0)),
          event_key: eventKey,
          page_path: dimension(row, 3),
          placement: dimension(row, 4),
          count: metric(row, 0),
        },
      ];
    }),
    (r) => `${r.site_id}|${r.date}|${r.event_key}|${r.page_path}|${r.placement}`,
    (a, b) => ({ ...a, count: a.count + b.count }),
  );
  console.error(`GA4 key events: ${keyEvents.length} rows`);
} catch (error) {
  console.error(`GA4 key events skipped: ${error.message}`);
  try {
    const eventRows = await runReport(ga4, {
      property,
      dateRanges,
      dimensions: [{ name: "date" }, { name: "hostName" }, { name: "eventName" }, { name: "pagePath" }],
      metrics: [{ name: "eventCount" }],
      dimensionFilter: {
        filter: {
          fieldName: "eventName",
          inListFilter: { values: Object.keys(EVENT_NAME_TO_KEY), caseSensitive: false },
        },
      },
    });
    keyEvents = foldByKey(
      eventRows.flatMap((row) => {
        const site_id = resolveSiteId(row.dimensionValues?.[1]?.value);
        if (!site_id) return [];
        const eventKey = EVENT_NAME_TO_KEY[dimension(row, 2)];
        if (!eventKey) return [];
        return [
          {
            site_id,
            date: fromCompactDate(dimension(row, 0)),
            event_key: eventKey,
            page_path: dimension(row, 3),
            placement: "(not set)",
            count: metric(row, 0),
          },
        ];
      }),
      (r) => `${r.site_id}|${r.date}|${r.event_key}|${r.page_path}|${r.placement}`,
      (a, b) => ({ ...a, count: a.count + b.count }),
    );
    console.error(`GA4 key events (no placement): ${keyEvents.length} rows`);
  } catch (retryError) {
    console.error(`GA4 key events unavailable: ${retryError.message}`);
  }
}

const auth = new google.auth.JWT({
  email: credentials.client_email,
  key: credentials.private_key,
  scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
});
await auth.authorize();
const gsc = google.searchconsole({ version: "v1", auth });

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

const brandId = SITES["brandmultiplier.ai"];
let gscDaily = [];
let gscQueries = [];
let gscIndex = [];

try {
  const dailyRows = await queryAnalytics({
    startDate: window.start,
    endDate: window.end,
    dimensions: ["date"],
  });
  gscDaily = dailyRows.map((row) => ({
    site_id: brandId,
    date: String(row.keys[0]),
    clicks: Number(row.clicks ?? 0),
    impressions: Number(row.impressions ?? 0),
    ctr: Number(row.ctr ?? 0),
    avg_position: Number(row.position ?? 0),
  }));

  const queryRows = await queryAnalytics({
    startDate: window.start,
    endDate: window.end,
    dimensions: ["date", "query"],
  });
  const mapped = queryRows.map((row) => ({
    site_id: brandId,
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
  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => b.impressions - a.impressions);
    gscQueries.push(...bucket.slice(0, TOP_QUERIES));
  }

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
        site_id: brandId,
        date: toDateString(todayUtc()),
        indexed_count: indexed,
        not_indexed_count: Math.max(submitted - indexed, 0),
      },
    ];
  }
  console.error(
    `GSC brandmultiplier.ai: ${gscDaily.length} days, ${gscQueries.length} queries, ${gscIndex.length} index rows`,
  );
} catch (error) {
  console.error(`Search Console skipped: ${error.message}`);
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
  upsert("ga4_daily", daily, ["site_id", "date", "sessions", "users", "pageviews"], "site_id, date", [
    "sessions",
    "users",
    "pageviews",
  ]),
  upsert(
    "ga4_page_daily",
    pages,
    ["site_id", "date", "page_path", "pageviews", "sessions"],
    "site_id, date, page_path",
    ["pageviews", "sessions"],
  ),
  upsert(
    "ga4_source_daily",
    sources,
    ["site_id", "date", "source", "medium", "sessions", "users"],
    "site_id, date, source, medium",
    ["sessions", "users"],
  ),
  upsert(
    "ga4_country_daily",
    countries,
    ["site_id", "date", "country_code", "country_name", "sessions", "users"],
    "site_id, date, country_code",
    ["country_name", "sessions", "users"],
  ),
  upsert(
    "ga4_key_events_daily",
    keyEvents,
    ["site_id", "date", "event_key", "page_path", "placement", "count"],
    "site_id, date, event_key, page_path, placement",
    ["count"],
  ),
  upsert(
    "gsc_daily",
    gscDaily,
    ["site_id", "date", "clicks", "impressions", "ctr", "avg_position"],
    "site_id, date",
    ["clicks", "impressions", "ctr", "avg_position"],
  ),
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
values ('ga4', 'success', now(), now(), '${window.start}'::date, '${window.end}'::date, ${daily.length + pages.length + sources.length + countries.length + keyEvents.length});
`,
  gscDaily.length + gscQueries.length + gscIndex.length > 0
    ? `insert into public.ingestion_runs (source, status, started_at, finished_at, window_start, window_end, rows_written)
values ('gsc', 'success', now(), now(), '${window.start}'::date, '${window.end}'::date, ${gscDaily.length + gscQueries.length + gscIndex.length});
`
    : `-- gsc ingest did not run\n`,
].join("\n");

const out = new URL("../.google-upsert.sql", import.meta.url);
writeFileSync(out, sql);
console.error(`Wrote ${out.pathname}`);
console.error(
  JSON.stringify(
    {
      window,
      ga4_daily: daily.length,
      ga4_page_daily: pages.length,
      ga4_source_daily: sources.length,
      ga4_country_daily: countries.length,
      ga4_key_events_daily: keyEvents.length,
      gsc_daily: gscDaily.length,
      gsc_query_daily: gscQueries.length,
      gsc_index_status: gscIndex.length,
      unmatched_hosts: [...hosts.keys()].filter((h) => !resolveSiteId(h)),
    },
    null,
    2,
  ),
);
