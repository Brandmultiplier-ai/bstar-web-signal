import type { ClarityDimension, ClarityMetric } from "@/lib/clients/clarity";
import { foldClarityBreakdown, foldClarityPages, weightedRate } from "@/lib/clarity-pages";
import { CLARITY_PROJECT_TOKENS } from "@/lib/clarity-tokens";
import type {
  ClarityBreakdownDaily,
  ClarityDaily,
  ClarityPageDaily,
  Site,
} from "@/lib/database.types";

/** URL, then one call each for Device, Browser, Source, Country, and OS. */
export const CLARITY_PULL_DIMENSIONS: ClarityDimension[] = [
  "URL",
  "Device",
  "Browser",
  "Source",
  "Country",
  "OS",
];

const BREAKDOWNS: Array<{ dimension: ClarityBreakdownDaily["dimension"]; api: ClarityDimension }> = [
  { dimension: "device", api: "Device" },
  { dimension: "browser", api: "Browser" },
  { dimension: "source", api: "Source" },
  { dimension: "country", api: "Country" },
  { dimension: "os", api: "OS" },
];

export type ClarityFetch = (token: string, dimensions: ClarityDimension[]) => Promise<ClarityMetric[]>;

export type ClarityProjectPull = {
  projectId: string;
  domains: string[];
  pages: ClarityPageDaily[];
  daily: ClarityDaily;
  breakdowns: ClarityBreakdownDaily[];
};

export type ClarityCollectResult = {
  /** False only when every project that had a token failed. Missing tokens are skips. */
  ok: boolean;
  projects: ClarityProjectPull[];
  note: string | null;
  /** Shown on the error row when ok is false. Names the domains that failed. */
  message: string | null;
  skipped: string[];
};

function resolveSiteId(host: string, sites: Site[]): string | null {
  const normalized = host.toLowerCase().replace(/^www\./, "");
  return (
    sites.find((site) => site.domain.toLowerCase().replace(/^www\./, "") === normalized)?.id ?? null
  );
}

export function clarityFailureNote(domains: string[]): string | null {
  if (domains.length === 0) return null;
  return `Clarity failed for ${domains.join(", ")}.`;
}

function joinNotes(parts: Array<string | null>): string | null {
  const text = parts.filter((part): part is string => Boolean(part)).join(" ");
  return text.length > 0 ? text : null;
}

async function pullOne(
  projectId: string,
  token: string,
  sites: Site[],
  date: string,
  fetchInsights: ClarityFetch,
): Promise<Omit<ClarityProjectPull, "domains">> {
  const metrics = await fetchInsights(token, ["URL"]);
  const pages = foldClarityPages(metrics);
  const pageRows: ClarityPageDaily[] = pages.map((page) => ({
    clarity_project_id: projectId,
    date,
    page_path: page.pagePath,
    site_id: resolveSiteId(page.host, sites),
    host: page.host,
    sessions: page.sessions,
    distinct_users: page.distinctUsers,
    scroll_depth_pct: page.scrollDepthPct,
    active_time_seconds: page.activeTimeSeconds,
    total_time_seconds: page.totalTimeSeconds,
    rage_click_pct: page.rageClickPct,
    dead_click_pct: page.deadClickPct,
    excessive_scroll_pct: page.excessiveScrollPct,
    quick_back_pct: page.quickBackPct,
    script_error_pct: page.scriptErrorPct,
  }));

  const daily: ClarityDaily = {
    clarity_project_id: projectId,
    date,
    sessions: pages.reduce((sum, page) => sum + page.sessions, 0),
    unique_users: pages.reduce((sum, page) => sum + page.distinctUsers, 0),
    rage_click_pct: weightedRate(pages, (page) => page.rageClickPct),
    dead_click_pct: weightedRate(pages, (page) => page.deadClickPct),
    excessive_scroll_pct: weightedRate(pages, (page) => page.excessiveScrollPct),
    quick_back_pct: weightedRate(pages, (page) => page.quickBackPct),
    scroll_depth_pct: weightedRate(pages, (page) => page.scrollDepthPct),
    active_time_seconds: weightedRate(pages, (page) => page.activeTimeSeconds),
    script_error_pct: weightedRate(pages, (page) => page.scriptErrorPct),
  };

  const breakdowns: ClarityBreakdownDaily[] = [];
  for (const item of BREAKDOWNS) {
    try {
      const extra = await fetchInsights(token, [item.api]);
      for (const row of foldClarityBreakdown(extra)) {
        breakdowns.push({
          clarity_project_id: projectId,
          date,
          dimension: item.dimension,
          key: row.key,
          sessions: row.sessions,
          distinct_users: row.distinctUsers,
        });
      }
    } catch {
      // A failed slice must not drop the URL rows or the other project.
      console.error("[clarity] breakdown", item.dimension);
    }
  }

  return { projectId, pages: pageRows, daily, breakdowns };
}

/**
 * Pulls each configured project with its own token. One project's error is
 * caught so the next project still runs. Quotas are not shared: each token
 * is one Clarity project, and each project is asked six times.
 */
export async function collectClarityProjects(args: {
  sites: Site[];
  date: string;
  readEnv: (name: string) => string | null | undefined;
  fetchInsights: ClarityFetch;
}): Promise<ClarityCollectResult> {
  const skipped: string[] = [];
  const skipNotes: string[] = [];
  const groups = new Map<string, Site[]>();

  for (const site of args.sites) {
    if (!site.clarity_project_id) {
      skipped.push(site.slug);
      skipNotes.push(`${site.domain} skipped: no Clarity project.`);
      continue;
    }
    const list = groups.get(site.clarity_project_id) ?? [];
    list.push(site);
    groups.set(site.clarity_project_id, list);
  }

  const ready: Array<{ projectId: string; sites: Site[]; token: string }> = [];
  for (const [projectId, sites] of groups) {
    const envName = CLARITY_PROJECT_TOKENS[projectId];
    const token = envName ? args.readEnv(envName)?.trim() : "";
    if (!envName || !token) {
      for (const site of sites) {
        skipped.push(site.slug);
        skipNotes.push(`${site.domain} skipped: no Clarity token configured.`);
      }
      continue;
    }
    ready.push({ projectId, sites, token });
  }

  const projects: ClarityProjectPull[] = [];
  const failedDomains: string[] = [];
  for (const project of ready) {
    const domains = project.sites.map((site) => site.domain);
    try {
      const pulled = await pullOne(
        project.projectId,
        project.token,
        args.sites,
        args.date,
        args.fetchInsights,
      );
      projects.push({ ...pulled, domains });
    } catch {
      console.error("[clarity] failed", domains.join(","));
      failedDomains.push(...domains);
    }
  }

  const note = joinNotes([skipNotes.join(" "), clarityFailureNote(failedDomains)]);
  const everyAttemptFailed = ready.length > 0 && projects.length === 0;
  return {
    ok: !everyAttemptFailed,
    projects,
    note: everyAttemptFailed ? null : note,
    message: everyAttemptFailed ? note : null,
    skipped,
  };
}
