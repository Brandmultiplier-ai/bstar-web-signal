import { findMetric, numeric, type ClarityMetric } from "@/lib/clients/clarity";

/**
 * Folds a dimensioned Clarity response into one row per URL.
 *
 * Clarity returns each metric as its own array keyed by the same `Url`, so the
 * rows have to be joined on URL rather than read positionally -- the arrays are
 * not the same length (Traffic includes bot-only URLs the others omit) and are
 * not in the same order.
 */

/** Hosts that are deploy previews rather than real traffic. */
const EXCLUDED_HOST_PATTERNS = [/\.vercel\.app$/i, /\.netlify\.app$/i, /^localhost$/i];

export type ClarityPageRow = {
  url: string;
  host: string;
  pagePath: string;
  sessions: number;
  distinctUsers: number;
  scrollDepthPct: number | null;
  activeTimeSeconds: number | null;
  totalTimeSeconds: number | null;
  rageClickPct: number | null;
  deadClickPct: number | null;
  excessiveScrollPct: number | null;
  quickBackPct: number | null;
  scriptErrorPct: number | null;
};

/**
 * Clarity reports some rows with a null URL, and some with values that are not
 * URLs at all (`https://Electron` shows up from desktop app webviews), so the
 * host has to be parsed defensively rather than trusted.
 */
function parseUrl(raw: string | number | null | undefined): { host: string; path: string } | null {
  if (typeof raw !== "string" || raw.trim() === "") return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  // A hostname with no dot is not a real site (the Electron case).
  if (!host.includes(".")) return null;
  if (EXCLUDED_HOST_PATTERNS.some((pattern) => pattern.test(host))) return null;

  // Drop the query string so UTM-tagged landings fold into one page, but keep
  // the hash: "/#pricing" is a distinct destination in this site's analytics.
  const path = `${parsed.pathname}${parsed.hash}` || "/";
  return { host, path };
}

/** Percentage of sessions on a page that exhibited a behavior metric. */
function ratesByUrl(metrics: ClarityMetric[], metricName: string): Map<string, number | null> {
  const byUrl = new Map<string, number | null>();
  for (const row of findMetric(metrics, metricName)) {
    if (typeof row.Url !== "string") continue;
    byUrl.set(row.Url, numeric(row.sessionsWithMetricPercentage));
  }
  return byUrl;
}

export function foldClarityPages(metrics: ClarityMetric[]): ClarityPageRow[] {
  const scrollByUrl = new Map<string, number | null>();
  for (const row of findMetric(metrics, "ScrollDepth")) {
    if (typeof row.Url !== "string") continue;
    scrollByUrl.set(row.Url, numeric(row.averageScrollDepth));
  }

  const engagementByUrl = new Map<string, { active: number | null; total: number | null }>();
  for (const row of findMetric(metrics, "EngagementTime")) {
    if (typeof row.Url !== "string") continue;
    engagementByUrl.set(row.Url, {
      active: numeric(row.activeTime),
      total: numeric(row.totalTime),
    });
  }

  const rage = ratesByUrl(metrics, "RageClickCount");
  const dead = ratesByUrl(metrics, "DeadClickCount");
  const excessive = ratesByUrl(metrics, "ExcessiveScroll");
  const quickBack = ratesByUrl(metrics, "QuickbackClick");
  const scriptError = ratesByUrl(metrics, "ScriptErrorCount");

  // Traffic is the spine: it is the only metric carrying session and user
  // counts, and it lists every URL the others might mention.
  const byPath = new Map<string, ClarityPageRow>();

  for (const row of findMetric(metrics, "Traffic")) {
    const parsed = parseUrl(row.Url);
    if (!parsed) continue;

    const rawUrl = row.Url as string;
    // totalSessionCount already excludes bots; totalBotSessionCount is separate.
    const sessions = numeric(row.totalSessionCount) ?? 0;
    const distinctUsers = numeric(row.distinctUserCount) ?? 0;
    const engagement = engagementByUrl.get(rawUrl);
    const key = `${parsed.host}|${parsed.path}`;

    const existing = byPath.get(key);
    if (existing) {
      // Two raw URLs can normalise to the same host+path (apex vs www, or a
      // UTM-tagged variant), so counts add and rates take the busier row.
      existing.sessions += sessions;
      existing.distinctUsers += distinctUsers;
      continue;
    }

    byPath.set(key, {
      url: rawUrl,
      host: parsed.host,
      pagePath: parsed.path,
      sessions,
      distinctUsers,
      scrollDepthPct: scrollByUrl.get(rawUrl) ?? null,
      activeTimeSeconds: engagement?.active ?? null,
      totalTimeSeconds: engagement?.total ?? null,
      rageClickPct: rage.get(rawUrl) ?? null,
      deadClickPct: dead.get(rawUrl) ?? null,
      excessiveScrollPct: excessive.get(rawUrl) ?? null,
      quickBackPct: quickBack.get(rawUrl) ?? null,
      scriptErrorPct: scriptError.get(rawUrl) ?? null,
    });
  }

  return [...byPath.values()].sort((a, b) => b.sessions - a.sessions);
}

/**
 * Session-weighted mean of a per-page rate. Clarity's project-wide aggregate
 * cannot be filtered to one site, so a site's rate has to be recomputed from
 * its own pages, weighted by sessions rather than averaged flat.
 */
export function weightedRate(
  rows: ClarityPageRow[],
  pick: (row: ClarityPageRow) => number | null,
): number | null {
  let weight = 0;
  let total = 0;
  for (const row of rows) {
    const value = pick(row);
    if (value === null) continue;
    // A page with rate data but no sessions still carries signal; weight it 1.
    const rowWeight = row.sessions > 0 ? row.sessions : 1;
    weight += rowWeight;
    total += value * rowWeight;
  }
  return weight > 0 ? Number((total / weight).toFixed(4)) : null;
}

const BREAKDOWN_FIELDS = ["Device", "Browser", "Source", "Country", "OS", "Name"] as const;

/**
 * Folds a Device / Browser / Source / Country live-insights call into
 * session counts per bucket. Traffic is the only metric we need here.
 */
export function foldClarityBreakdown(
  metrics: ClarityMetric[],
): Array<{ key: string; sessions: number; distinctUsers: number }> {
  const byKey = new Map<string, { key: string; sessions: number; distinctUsers: number }>();

  for (const row of findMetric(metrics, "Traffic")) {
    const raw =
      BREAKDOWN_FIELDS.map((field) => row[field]).find(
        (value) => typeof value === "string" && value.trim().length > 0,
      ) ?? "(not set)";
    const key = String(raw);
    const sessions = numeric(row.totalSessionCount) ?? 0;
    const users = numeric(row.distinctUserCount) ?? 0;
    const existing = byKey.get(key);
    if (existing) {
      existing.sessions += sessions;
      existing.distinctUsers += users;
    } else {
      byKey.set(key, { key, sessions, distinctUsers: users });
    }
  }

  return [...byKey.values()].sort((a, b) => b.sessions - a.sessions);
}
