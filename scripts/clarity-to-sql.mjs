/**
 * Turns the captured Clarity probe payload into SQL upserts.
 *
 * Used to load the first real Clarity data without a service-role key, by
 * applying the generated statements through the Supabase MCP connection. Once
 * SUPABASE_SERVICE_ROLE_KEY is set, POST /api/sync does this directly and this
 * script is no longer needed.
 *
 *   node scripts/clarity-to-sql.mjs > .clarity-upsert.sql
 */
import { readFileSync } from "node:fs";

const metrics = JSON.parse(
  readFileSync(new URL("../.clarity-probe.json", import.meta.url), "utf8"),
);

const EXCLUDED = [/\.vercel\.app$/i, /\.netlify\.app$/i, /^localhost$/i];

const num = (raw) => {
  if (raw === undefined || raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const find = (name) => metrics.find((m) => m.metricName === name)?.information ?? [];

function parseUrl(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (!host.includes(".")) return null;
  if (EXCLUDED.some((p) => p.test(host))) return null;
  return { host, path: `${parsed.pathname}${parsed.hash}` || "/" };
}

const rateMap = (name) => {
  const map = new Map();
  for (const row of find(name)) {
    if (typeof row.Url !== "string") continue;
    map.set(row.Url, num(row.sessionsWithMetricPercentage));
  }
  return map;
};

const scroll = new Map();
for (const row of find("ScrollDepth")) {
  if (typeof row.Url === "string") scroll.set(row.Url, num(row.averageScrollDepth));
}
const engagement = new Map();
for (const row of find("EngagementTime")) {
  if (typeof row.Url === "string") {
    engagement.set(row.Url, { active: num(row.activeTime), total: num(row.totalTime) });
  }
}

const rage = rateMap("RageClickCount");
const dead = rateMap("DeadClickCount");
const excessive = rateMap("ExcessiveScroll");
const quick = rateMap("QuickbackClick");
const script = rateMap("ScriptErrorCount");

const byPath = new Map();
for (const row of find("Traffic")) {
  const parsed = parseUrl(row.Url);
  if (!parsed) continue;
  const raw = row.Url;
  const sessions = num(row.totalSessionCount) ?? 0;
  const users = num(row.distinctUserCount) ?? 0;

  const existing = byPath.get(parsed.path);
  if (existing) {
    existing.sessions += sessions;
    existing.distinct_users += users;
    continue;
  }
  const eng = engagement.get(raw);
  byPath.set(parsed.path, {
    page_path: parsed.path,
    host: parsed.host,
    sessions,
    distinct_users: users,
    scroll_depth_pct: scroll.get(raw) ?? null,
    active_time_seconds: eng?.active ?? null,
    total_time_seconds: eng?.total ?? null,
    rage_click_pct: rage.get(raw) ?? null,
    dead_click_pct: dead.get(raw) ?? null,
    excessive_scroll_pct: excessive.get(raw) ?? null,
    quick_back_pct: quick.get(raw) ?? null,
    script_error_pct: script.get(raw) ?? null,
  });
}

const rows = [...byPath.values()].sort((a, b) => b.sessions - a.sessions);

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const PROJECT = "CLARITY_SHARED_PROJECT_ID";

const lit = (value) => (value === null ? "null" : String(value));
const str = (value) => `'${String(value).replace(/'/g, "''")}'`;

const values = rows
  .map(
    (r) =>
      `  (${str(PROJECT)}, '${yesterday}'::date, ${str(r.page_path)}, ` +
      `(select id from public.sites where domain = ${str(r.host)}), ${str(r.host)}, ` +
      `${r.sessions}, ${r.distinct_users}, ${lit(r.scroll_depth_pct)}, ` +
      `${lit(r.active_time_seconds)}, ${lit(r.total_time_seconds)}, ` +
      `${lit(r.rage_click_pct)}, ${lit(r.dead_click_pct)}, ${lit(r.excessive_scroll_pct)}, ` +
      `${lit(r.quick_back_pct)}, ${lit(r.script_error_pct)})`,
  )
  .join(",\n");

const weighted = (pick) => {
  let weight = 0;
  let total = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    const w = row.sessions > 0 ? row.sessions : 1;
    weight += w;
    total += value * w;
  }
  return weight > 0 ? Number((total / weight).toFixed(4)) : null;
};

console.log(`insert into public.clarity_page_daily (
  clarity_project_id, date, page_path, site_id, host,
  sessions, distinct_users, scroll_depth_pct,
  active_time_seconds, total_time_seconds,
  rage_click_pct, dead_click_pct, excessive_scroll_pct,
  quick_back_pct, script_error_pct
) values
${values}
on conflict (clarity_project_id, date, page_path) do update set
  site_id = excluded.site_id,
  host = excluded.host,
  sessions = excluded.sessions,
  distinct_users = excluded.distinct_users,
  scroll_depth_pct = excluded.scroll_depth_pct,
  active_time_seconds = excluded.active_time_seconds,
  total_time_seconds = excluded.total_time_seconds,
  rage_click_pct = excluded.rage_click_pct,
  dead_click_pct = excluded.dead_click_pct,
  excessive_scroll_pct = excluded.excessive_scroll_pct,
  quick_back_pct = excluded.quick_back_pct,
  script_error_pct = excluded.script_error_pct;

insert into public.clarity_daily (
  clarity_project_id, date, sessions, unique_users,
  rage_click_pct, dead_click_pct, excessive_scroll_pct,
  quick_back_pct, scroll_depth_pct, active_time_seconds, script_error_pct
) values (
  ${str(PROJECT)}, '${yesterday}'::date,
  ${rows.reduce((s, r) => s + r.sessions, 0)},
  ${rows.reduce((s, r) => s + r.distinct_users, 0)},
  ${lit(weighted((r) => r.rage_click_pct))},
  ${lit(weighted((r) => r.dead_click_pct))},
  ${lit(weighted((r) => r.excessive_scroll_pct))},
  ${lit(weighted((r) => r.quick_back_pct))},
  ${lit(weighted((r) => r.scroll_depth_pct))},
  ${lit(weighted((r) => r.active_time_seconds))},
  ${lit(weighted((r) => r.script_error_pct))}
)
on conflict (clarity_project_id, date) do update set
  sessions = excluded.sessions,
  unique_users = excluded.unique_users,
  rage_click_pct = excluded.rage_click_pct,
  dead_click_pct = excluded.dead_click_pct,
  excessive_scroll_pct = excluded.excessive_scroll_pct,
  quick_back_pct = excluded.quick_back_pct,
  scroll_depth_pct = excluded.scroll_depth_pct,
  active_time_seconds = excluded.active_time_seconds,
  script_error_pct = excluded.script_error_pct;

insert into public.ingestion_runs (source, status, started_at, finished_at, window_start, window_end, rows_written)
values ('clarity', 'success', now(), now(), '${yesterday}'::date - 2, '${yesterday}'::date, ${rows.length});
`);

console.error(`rows: ${rows.length}`);
console.error(`hosts: ${[...new Set(rows.map((r) => r.host))].join(", ")}`);
