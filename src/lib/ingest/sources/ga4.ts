import type { protos } from "@google-analytics/data";

import { createGa4Client } from "@/lib/clients/google";
import { fromCompactDate } from "@/lib/dates";
import {
  GA4_EVENT_NAME_TO_KEY,
  GA4_KEY_EVENTS,
  GA4_PLACEMENT_DIMENSION,
} from "@/lib/sources";
import { foldByKey, upsertRows } from "@/lib/ingest/upsert";
import type { Ingestor, IngestContext, IngestResult } from "@/lib/ingest/types";
import type {
  Ga4ChannelDaily,
  Ga4CountryDaily,
  Ga4Daily,
  Ga4DeviceDaily,
  Ga4KeyEventDaily,
  Ga4LandingDaily,
  Ga4OsDaily,
  Ga4PageDaily,
  Ga4SourceDaily,
  Site,
} from "@/lib/database.types";

type Row = protos.google.analytics.data.v1beta.IRow;
type RunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;

const TOP_PAGES_PER_DAY = 50;
const TOP_SOURCES_PER_DAY = 50;
const UNSET = "(not set)";

/**
 * GA4 ingestion is grouped by property rather than by site, because
 * brandmultiplier.ai and weservefounders.com share one property. We request
 * `hostName` as an extra dimension and fan each response row out to whichever
 * site claims that hostname, so one API call serves both sites.
 *
 * Each run upserts the lookback window. Days outside that window stay in the
 * tables forever. Date chips only filter stored rows — they never call Google.
 */
type PropertyGroup = {
  propertyId: string;
  /** hostname -> site_id. Empty when the property serves a single site. */
  byHostname: Map<string, string>;
  /** Used when the property has exactly one site and no hostname filter. */
  fallbackSiteId: string | null;
};

function groupSitesByProperty(sites: Site[]): { groups: PropertyGroup[]; skipped: string[] } {
  const groups = new Map<string, PropertyGroup>();
  const skipped: string[] = [];

  for (const site of sites) {
    if (!site.ga4_property_id) {
      skipped.push(site.slug);
      continue;
    }

    const group =
      groups.get(site.ga4_property_id) ??
      ({
        propertyId: site.ga4_property_id,
        byHostname: new Map<string, string>(),
        fallbackSiteId: null,
      } satisfies PropertyGroup);

    if (site.ga4_hostname_filter) {
      group.byHostname.set(site.ga4_hostname_filter.toLowerCase(), site.id);
    } else {
      group.fallbackSiteId = site.id;
    }

    groups.set(site.ga4_property_id, group);
  }

  return { groups: [...groups.values()], skipped };
}

/**
 * Resolves a GA4 `hostName` value to one of our sites. A property with a
 * single unfiltered site takes everything; a shared property only takes rows
 * whose hostname it recognises, so stray staging or preview domains are
 * dropped rather than mixed into a site's numbers.
 */
function resolveSiteId(group: PropertyGroup, hostName: string | null | undefined): string | null {
  if (group.byHostname.size === 0) return group.fallbackSiteId;
  const host = (hostName ?? "").toLowerCase().replace(/^www\./, "");
  return group.byHostname.get(host) ?? group.fallbackSiteId;
}

function metric(row: Row, index: number): number {
  return Number(row.metricValues?.[index]?.value ?? 0);
}

function dimension(row: Row, index: number): string {
  const value = row.dimensionValues?.[index]?.value;
  return value && value.length > 0 ? value : UNSET;
}

async function runReport(
  request: protos.google.analytics.data.v1beta.IRunReportRequest,
): Promise<Row[]> {
  const client = createGa4Client();
  const rows: Row[] = [];
  let offset = 0;
  const limit = 100_000;

  // GA4 caps a single response, so page until it stops returning rows.
  for (;;) {
    const [response] = (await client.runReport({ ...request, limit, offset })) as [
      RunReportResponse,
      unknown,
      unknown,
    ];
    const page = response.rows ?? [];
    rows.push(...page);
    offset += page.length;
    if (page.length < limit || offset >= Number(response.rowCount ?? 0)) break;
  }

  return rows;
}

function weightedAvg(
  a: number | null,
  aWeight: number,
  b: number | null,
  bWeight: number,
): number | null {
  if (a === null && b === null) return null;
  const left = a ?? 0;
  const right = b ?? 0;
  const weight = aWeight + bWeight;
  if (weight <= 0) return a ?? b;
  return (left * aWeight + right * bWeight) / weight;
}

/** sessions / users / pageviews / engagement per site per day. */
async function ingestTotals(ctx: IngestContext, group: PropertyGroup): Promise<Ga4Daily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
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

  const mapped: Ga4Daily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;
    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      sessions: metric(row, 0),
      users: metric(row, 1),
      pageviews: metric(row, 2),
      new_users: metric(row, 3),
      engaged_sessions: metric(row, 4),
      bounce_rate: metric(row, 5),
      avg_session_duration: metric(row, 6),
    });
  }

  // Several hostnames can map to one site (apex plus www), so sum them.
  return foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}`,
    (a, b) => ({
      ...a,
      sessions: a.sessions + b.sessions,
      users: a.users + b.users,
      pageviews: a.pageviews + b.pageviews,
      new_users: a.new_users + b.new_users,
      engaged_sessions: a.engaged_sessions + b.engaged_sessions,
      bounce_rate: weightedAvg(a.bounce_rate, a.sessions, b.bounce_rate, b.sessions),
      avg_session_duration: weightedAvg(
        a.avg_session_duration,
        a.sessions,
        b.avg_session_duration,
        b.sessions,
      ),
    }),
  );
}

async function ingestPages(ctx: IngestContext, group: PropertyGroup): Promise<Ga4PageDaily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [{ name: "date" }, { name: "hostName" }, { name: "pagePath" }],
    metrics: [
      { name: "screenPageViews" },
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "engagedSessions" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
  });

  const mapped: Ga4PageDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;
    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      page_path: dimension(row, 2),
      pageviews: metric(row, 0),
      sessions: metric(row, 1),
      users: metric(row, 2),
      engaged_sessions: metric(row, 3),
      bounce_rate: metric(row, 4),
      avg_session_duration: metric(row, 5),
    });
  }

  const folded = foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.page_path}`,
    (a, b) => ({
      ...a,
      pageviews: a.pageviews + b.pageviews,
      sessions: a.sessions + b.sessions,
      users: a.users + b.users,
      engaged_sessions: a.engaged_sessions + b.engaged_sessions,
      bounce_rate: weightedAvg(a.bounce_rate, a.sessions, b.bounce_rate, b.sessions),
      avg_session_duration: weightedAvg(
        a.avg_session_duration,
        a.sessions,
        b.avg_session_duration,
        b.sessions,
      ),
    }),
  );

  return keepTopPerSiteDay(folded, (r) => r.pageviews, TOP_PAGES_PER_DAY);
}

async function ingestDevices(ctx: IngestContext, group: PropertyGroup): Promise<Ga4DeviceDaily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [{ name: "date" }, { name: "hostName" }, { name: "deviceCategory" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
  });

  const mapped: Ga4DeviceDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;
    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      device: dimension(row, 2),
      sessions: metric(row, 0),
      users: metric(row, 1),
    });
  }

  return foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.device}`,
    (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
  );
}

async function ingestLandings(
  ctx: IngestContext,
  group: PropertyGroup,
): Promise<Ga4LandingDaily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [{ name: "date" }, { name: "hostName" }, { name: "landingPage" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "engagedSessions" },
      { name: "bounceRate" },
      { name: "averageSessionDuration" },
    ],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  const mapped: Ga4LandingDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;
    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      page_path: dimension(row, 2),
      sessions: metric(row, 0),
      users: metric(row, 1),
      engaged_sessions: metric(row, 2),
      bounce_rate: metric(row, 3),
      avg_session_duration: metric(row, 4),
    });
  }

  const folded = foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.page_path}`,
    (a, b) => ({
      ...a,
      sessions: a.sessions + b.sessions,
      users: a.users + b.users,
      engaged_sessions: a.engaged_sessions + b.engaged_sessions,
      bounce_rate: weightedAvg(a.bounce_rate, a.sessions, b.bounce_rate, b.sessions),
      avg_session_duration: weightedAvg(
        a.avg_session_duration,
        a.sessions,
        b.avg_session_duration,
        b.sessions,
      ),
    }),
  );

  return keepTopPerSiteDay(folded, (r) => r.sessions, TOP_PAGES_PER_DAY);
}

async function ingestOperatingSystems(
  ctx: IngestContext,
  group: PropertyGroup,
): Promise<Ga4OsDaily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [{ name: "date" }, { name: "hostName" }, { name: "operatingSystem" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
  });

  const mapped: Ga4OsDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;
    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      os: dimension(row, 2),
      sessions: metric(row, 0),
      users: metric(row, 1),
    });
  }

  return foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.os}`,
    (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
  );
}

async function ingestChannels(ctx: IngestContext, group: PropertyGroup): Promise<Ga4ChannelDaily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [{ name: "date" }, { name: "hostName" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
  });

  const mapped: Ga4ChannelDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;
    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      channel: dimension(row, 2),
      sessions: metric(row, 0),
      users: metric(row, 1),
    });
  }

  return foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.channel}`,
    (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
  );
}

async function ingestSources(ctx: IngestContext, group: PropertyGroup): Promise<Ga4SourceDaily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [
      { name: "date" },
      { name: "hostName" },
      { name: "sessionSource" },
      { name: "sessionMedium" },
    ],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  });

  const mapped: Ga4SourceDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;
    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      source: dimension(row, 2),
      medium: dimension(row, 3),
      sessions: metric(row, 0),
      users: metric(row, 1),
    });
  }

  const folded = foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.source}|${r.medium}`,
    (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
  );

  return keepTopPerSiteDay(folded, (r) => r.sessions, TOP_SOURCES_PER_DAY);
}

/**
 * The five named key events, with the page path and placement they fired from.
 * Filtered to our event names server-side so we do not pull the full event
 * catalogue for a long tail we never display.
 */
async function ingestKeyEvents(
  ctx: IngestContext,
  group: PropertyGroup,
): Promise<Ga4KeyEventDaily[]> {
  const eventNames = Object.values(GA4_KEY_EVENTS).map((e) => e.gaEventName);

  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [
      { name: "date" },
      { name: "hostName" },
      { name: "eventName" },
      { name: "pagePath" },
      { name: GA4_PLACEMENT_DIMENSION },
    ],
    metrics: [{ name: "eventCount" }],
    dimensionFilter: {
      filter: {
        fieldName: "eventName",
        inListFilter: { values: eventNames, caseSensitive: false },
      },
    },
  });

  const mapped: Ga4KeyEventDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;

    const eventKey = GA4_EVENT_NAME_TO_KEY[dimension(row, 2)];
    // Guard against a filter that matched case-insensitively but does not map
    // back to one of our five keys; the table's check constraint would reject.
    if (!eventKey) continue;

    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      event_key: eventKey,
      page_path: dimension(row, 3),
      placement: dimension(row, 4),
      count: metric(row, 0),
    });
  }

  return foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.event_key}|${r.page_path}|${r.placement}`,
    (a, b) => ({ ...a, count: a.count + b.count }),
  );
}

/**
 * Sessions by country, which the traffic globe renders. `countryId` is the
 * ISO 3166-1 alpha-2 code; rows without one (GA4 reports "(not set)" for
 * unresolved geography) are dropped because the globe has nowhere to plot them.
 */
async function ingestCountries(
  ctx: IngestContext,
  group: PropertyGroup,
): Promise<Ga4CountryDaily[]> {
  const rows = await runReport({
    property: `properties/${group.propertyId}`,
    dateRanges: [{ startDate: ctx.window.start, endDate: ctx.window.end }],
    dimensions: [
      { name: "date" },
      { name: "hostName" },
      { name: "countryId" },
      { name: "country" },
    ],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
  });

  const mapped: Ga4CountryDaily[] = [];
  for (const row of rows) {
    const siteId = resolveSiteId(group, row.dimensionValues?.[1]?.value);
    if (!siteId) continue;

    const code = (row.dimensionValues?.[2]?.value ?? "").toUpperCase();
    if (!/^[A-Z]{2}$/.test(code)) continue;

    mapped.push({
      site_id: siteId,
      date: fromCompactDate(dimension(row, 0)),
      country_code: code,
      country_name: dimension(row, 3),
      sessions: metric(row, 0),
      users: metric(row, 1),
    });
  }

  return foldByKey(
    mapped,
    (r) => `${r.site_id}|${r.date}|${r.country_code}`,
    (a, b) => ({ ...a, sessions: a.sessions + b.sessions, users: a.users + b.users }),
  );
}

/**
 * Trims a long-tail breakdown to the top N per site per day. Storing every
 * path and every source for every day would grow without bound for data the
 * dashboard never renders.
 */
function keepTopPerSiteDay<T extends { site_id: string; date: string }>(
  rows: T[],
  weight: (row: T) => number,
  limit: number,
): T[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.site_id}|${row.date}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  }

  const kept: T[] = [];
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => weight(b) - weight(a));
    kept.push(...bucket.slice(0, limit));
  }
  return kept;
}

export const ga4Ingestor: Ingestor = {
  source: "ga4",
  async run(ctx): Promise<IngestResult> {
    const { groups, skipped } = groupSitesByProperty(ctx.sites);
    const details: Record<string, number> = {
      ga4_daily: 0,
      ga4_page_daily: 0,
      ga4_source_daily: 0,
      ga4_key_events_daily: 0,
      ga4_country_daily: 0,
      ga4_device_daily: 0,
      ga4_channel_daily: 0,
      ga4_landing_daily: 0,
      ga4_os_daily: 0,
    };

    for (const group of groups) {
      const [totals, pages, sources, keyEvents, countries, devices, channels, landings, os] =
        await Promise.all([
          ingestTotals(ctx, group),
          ingestPages(ctx, group),
          ingestSources(ctx, group),
          ingestKeyEvents(ctx, group),
          ingestCountries(ctx, group),
          ingestDevices(ctx, group),
          ingestChannels(ctx, group),
          ingestLandings(ctx, group),
          ingestOperatingSystems(ctx, group),
        ]);

      details.ga4_daily += await upsertRows(ctx.admin, "ga4_daily", totals, "site_id,date");
      details.ga4_page_daily += await upsertRows(
        ctx.admin,
        "ga4_page_daily",
        pages,
        "site_id,date,page_path",
      );
      details.ga4_source_daily += await upsertRows(
        ctx.admin,
        "ga4_source_daily",
        sources,
        "site_id,date,source,medium",
      );
      details.ga4_key_events_daily += await upsertRows(
        ctx.admin,
        "ga4_key_events_daily",
        keyEvents,
        "site_id,date,event_key,page_path,placement",
      );
      details.ga4_country_daily += await upsertRows(
        ctx.admin,
        "ga4_country_daily",
        countries,
        "site_id,date,country_code",
      );
      details.ga4_device_daily += await upsertRows(
        ctx.admin,
        "ga4_device_daily",
        devices,
        "site_id,date,device",
      );
      details.ga4_channel_daily += await upsertRows(
        ctx.admin,
        "ga4_channel_daily",
        channels,
        "site_id,date,channel",
      );
      details.ga4_landing_daily += await upsertRows(
        ctx.admin,
        "ga4_landing_daily",
        landings,
        "site_id,date,page_path",
      );
      details.ga4_os_daily += await upsertRows(ctx.admin, "ga4_os_daily", os, "site_id,date,os");
    }

    return {
      rowsWritten: Object.values(details).reduce((sum, n) => sum + n, 0),
      details,
      skipped,
    };
  },
};
