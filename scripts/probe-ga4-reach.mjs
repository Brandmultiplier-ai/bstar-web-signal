/**
 * Extra GA4 slices: landing pages, OS mix, page users / engaged sessions.
 *   node scripts/probe-ga4-reach.mjs path/to/key.json
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const { BetaAnalyticsDataClient } = require("@google-analytics/data");

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error("Usage: node scripts/probe-ga4-reach.mjs path/to/key.json");
  process.exit(1);
}

const key = JSON.parse(readFileSync(resolve(jsonPath), "utf8"));
const ga4 = new BetaAnalyticsDataClient({
  credentials: { client_email: key.client_email, private_key: key.private_key },
});

const PROPERTY = "properties/527690219";
const SITES = {
  "brandmultiplier.ai": "2c065254-eb11-4394-915d-c965ce04fe85",
  "weservefounders.com": "13d3aac8-0b3a-40e4-a06a-95b9f678691f",
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
function fromCompact(compact) {
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}
function resolveSite(hostName) {
  const host = (hostName ?? "").toLowerCase().replace(/^www\./, "");
  return SITES[host] ?? null;
}
function metric(row, i) {
  return Number(row.metricValues?.[i]?.value ?? 0);
}
function dimension(row, i) {
  const value = row.dimensionValues?.[i]?.value;
  return value && value.length > 0 ? value : "(not set)";
}
function fold(rows, keyOf, merge) {
  const map = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const existing = map.get(key);
    map.set(key, existing ? merge(existing, row) : row);
  }
  return [...map.values()];
}
function weighted(a, aw, b, bw) {
  if (a === null && b === null) return null;
  const w = aw + bw;
  if (w <= 0) return a ?? b;
  return ((a ?? 0) * aw + (b ?? 0) * bw) / w;
}
function keepTop(rows, weight, limit) {
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

const end = addDays(todayUtc(), -1);
const start = addDays(end, -9);
const window = { start: toDateString(start), end: toDateString(end) };
const dateRanges = [{ startDate: window.start, endDate: window.end }];

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

console.error(`GA4 reach window ${window.start} → ${window.end}`);

const pageRows = await runReport({
  property: PROPERTY,
  dateRanges,
  dimensions: [{ name: "date" }, { name: "hostName" }, { name: "pagePath" }],
  metrics: [
    { name: "screenPageViews" },
    { name: "sessions" },
    { name: "totalUsers" },
    { name: "engagedSessions" },
    { name: "bounceRate" },
    { name: "averageSessionDuration" },
  ],
});

const pages = keepTop(
  fold(
    pageRows.flatMap((row) => {
      const site_id = resolveSite(row.dimensionValues?.[1]?.value);
      if (!site_id) return [];
      return [
        {
          site_id,
          date: fromCompact(dimension(row, 0)),
          page_path: dimension(row, 2),
          pageviews: metric(row, 0),
          sessions: metric(row, 1),
          users: metric(row, 2),
          engaged_sessions: metric(row, 3),
          bounce_rate: metric(row, 4),
          avg_session_duration: metric(row, 5),
        },
      ];
    }),
    (r) => `${r.site_id}|${r.date}|${r.page_path}`,
    (a, b) => ({
      ...a,
      pageviews: a.pageviews + b.pageviews,
      sessions: a.sessions + b.sessions,
      users: a.users + b.users,
      engaged_sessions: a.engaged_sessions + b.engaged_sessions,
      bounce_rate: weighted(a.bounce_rate, a.sessions, b.bounce_rate, b.sessions),
      avg_session_duration: weighted(
        a.avg_session_duration,
        a.sessions,
        b.avg_session_duration,
        b.sessions,
      ),
    }),
  ),
  (r) => r.pageviews,
  50,
);

const landingRows = await runReport({
  property: PROPERTY,
  dateRanges,
  dimensions: [{ name: "date" }, { name: "hostName" }, { name: "landingPage" }],
  metrics: [
    { name: "sessions" },
    { name: "totalUsers" },
    { name: "engagedSessions" },
    { name: "bounceRate" },
    { name: "averageSessionDuration" },
  ],
});

const landings = keepTop(
  fold(
    landingRows.flatMap((row) => {
      const site_id = resolveSite(row.dimensionValues?.[1]?.value);
      if (!site_id) return [];
      return [
        {
          site_id,
          date: fromCompact(dimension(row, 0)),
          page_path: dimension(row, 2),
          sessions: metric(row, 0),
          users: metric(row, 1),
          engaged_sessions: metric(row, 2),
          bounce_rate: metric(row, 3),
          avg_session_duration: metric(row, 4),
        },
      ];
    }),
    (r) => `${r.site_id}|${r.date}|${r.page_path}`,
    (a, b) => ({
      ...a,
      sessions: a.sessions + b.sessions,
      users: a.users + b.users,
      engaged_sessions: a.engaged_sessions + b.engaged_sessions,
      bounce_rate: weighted(a.bounce_rate, a.sessions, b.bounce_rate, b.sessions),
      avg_session_duration: weighted(
        a.avg_session_duration,
        a.sessions,
        b.avg_session_duration,
        b.sessions,
      ),
    }),
  ),
  (r) => r.sessions,
  50,
);

const osRows = await runReport({
  property: PROPERTY,
  dateRanges,
  dimensions: [{ name: "date" }, { name: "hostName" }, { name: "operatingSystem" }],
  metrics: [{ name: "sessions" }, { name: "totalUsers" }],
});

const os = fold(
  osRows.flatMap((row) => {
    const site_id = resolveSite(row.dimensionValues?.[1]?.value);
    if (!site_id) return [];
    return [
      {
        site_id,
        date: fromCompact(dimension(row, 0)),
        os: dimension(row, 2),
        sessions: metric(row, 0),
        users: metric(row, 1),
      },
    ];
  }),
  (r) => `${r.site_id}|${r.date}|${r.os}`,
  (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
);

function str(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}
function n(value) {
  return value === null || value === undefined ? "null" : Number(value);
}

const sql = [
  pages.length
    ? `insert into public.ga4_page_daily (site_id, date, page_path, pageviews, sessions, users, engaged_sessions, bounce_rate, avg_session_duration) values\n${pages
        .map(
          (r) =>
            `(${str(r.site_id)}, ${str(r.date)}::date, ${str(r.page_path)}, ${r.pageviews}, ${r.sessions}, ${r.users}, ${r.engaged_sessions}, ${n(r.bounce_rate)}, ${n(r.avg_session_duration)})`,
        )
        .join(",\n")}
on conflict (site_id, date, page_path) do update set pageviews = excluded.pageviews, sessions = excluded.sessions, users = excluded.users, engaged_sessions = excluded.engaged_sessions, bounce_rate = excluded.bounce_rate, avg_session_duration = excluded.avg_session_duration;`
    : "",
  landings.length
    ? `insert into public.ga4_landing_daily (site_id, date, page_path, sessions, users, bounce_rate, avg_session_duration, engaged_sessions) values\n${landings
        .map(
          (r) =>
            `(${str(r.site_id)}, ${str(r.date)}::date, ${str(r.page_path)}, ${r.sessions}, ${r.users}, ${n(r.bounce_rate)}, ${n(r.avg_session_duration)}, ${r.engaged_sessions})`,
        )
        .join(",\n")}
on conflict (site_id, date, page_path) do update set sessions = excluded.sessions, users = excluded.users, bounce_rate = excluded.bounce_rate, avg_session_duration = excluded.avg_session_duration, engaged_sessions = excluded.engaged_sessions;`
    : "",
  os.length
    ? `insert into public.ga4_os_daily (site_id, date, os, sessions, users) values\n${os
        .map(
          (r) =>
            `(${str(r.site_id)}, ${str(r.date)}::date, ${str(r.os)}, ${r.sessions}, ${r.users})`,
        )
        .join(",\n")}
on conflict (site_id, date, os) do update set sessions = excluded.sessions, users = excluded.users;`
    : "",
].join("\n\n");

writeFileSync(new URL("../.google-reach.sql", import.meta.url), sql);
console.error(
  JSON.stringify(
    {
      window,
      pages: pages.length,
      landings: landings.length,
      os: os.length,
    },
    null,
    2,
  ),
);
