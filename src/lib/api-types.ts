import type { Ga4EventKey } from "@/lib/database.types";

export type Freshness = { lastSuccessAt: string | null; lastErrorAt: string | null };
export type Range = { start: string; end: string };

export type SiteSummary = {
  id: string;
  slug: string;
  domain: string;
  displayName: string;
  hasGa4: boolean;
  hasSearchConsole: boolean;
  hasClarity: boolean;
};

export type Ga4Response = {
  range: Range;
  freshness: Freshness;
  totals: {
    sessions: number;
    users: number;
    pageviews: number;
    newUsers: number;
    engagedSessions: number;
    engagementRate: number | null;
    bounceRate: number | null;
    avgSessionDuration: number | null;
    pagesPerSession: number | null;
  };
    series: Array<{
      date: string;
      sessions: number;
      users: number;
      pageviews: number;
      newUsers: number;
      returningUsers: number;
      bounceRate: number | null;
      engagedSessions: number;
    }>;
    devices: Array<{ name: string; value: number }>;
    channels: Array<{ name: string; value: number }>;
    countries: Array<{ name: string; value: number }>;
    operatingSystems: Array<{ name: string; value: number }>;
    topPages: Array<{
      key: string;
      page_path: string;
      pageviews: number;
      sessions: number;
      users: number;
      bounceRate: number | null;
      avgSessionDuration: number | null;
      engagementRate: number | null;
    }>;
    landingPages: Array<{
      key: string;
      page_path: string;
      sessions: number;
      users: number;
      bounceRate: number | null;
      avgSessionDuration: number | null;
      engagementRate: number | null;
    }>;
  topSources: Array<{ key: string; source: string; medium: string; sessions: number; users: number }>;
  keyEvents: Array<{
    eventKey: Ga4EventKey;
    label: string;
    total: number;
    byPlacement: Array<{ key: string; placement: string; page_path: string; count: number }>;
  }>;
};

export type GscResponse = {
  range: Range;
  freshness: Freshness;
  totals: { clicks: number; impressions: number; ctr: number; avgPosition: number };
  series: Array<{
    date: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avg_position: number;
  }>;
  topQueries: Array<{
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    avgPosition: number;
  }>;
  indexStatus: { observedOn: string; indexed: number; notIndexed: number } | null;
};

export type ClarityResponse = {
  range: Range;
  freshness: Freshness;
  coveredDomains: string[];
  totals: {
    sessions: number;
    uniqueUsers: number;
    rageClickPct: number | null;
    deadClickPct: number | null;
    excessiveScrollPct: number | null;
    quickBackPct: number | null;
    scrollDepthPct: number | null;
    activeTimeSeconds: number | null;
    scriptErrorPct: number | null;
    daysWithRates: number;
    daysTotal: number;
  };
  series: Array<{
    date: string;
    sessions: number;
    uniqueUsers: number;
    rageClickPct: number | null;
    deadClickPct: number | null;
    excessiveScrollPct: number | null;
    quickBackPct: number | null;
    scrollDepthPct: number | null;
    activeTimeSeconds: number | null;
    scriptErrorPct: number | null;
  }>;
  devices: Array<{ name: string; value: number }>;
  browsers: Array<{ name: string; value: number }>;
  sources: Array<{ name: string; value: number }>;
  countries: Array<{ name: string; value: number }>;
  operatingSystems: Array<{ name: string; value: number }>;
  byHost: Array<{ name: string; value: number }>;
  topPages: Array<{
    host: string;
    pagePath: string;
    sessions: number;
    distinctUsers: number;
    scrollDepthPct: number | null;
    activeTimeSeconds: number | null;
    rageClickPct: number | null;
    deadClickPct: number | null;
    quickBackPct: number | null;
    scriptErrorPct: number | null;
    excessiveScrollPct: number | null;
    totalTimeSeconds: number | null;
  }>;
};

export type CalendlyResponse = {
  range: Range;
  freshness: Freshness;
  totals: { bookings: number; attributed: number; cancelled: number };
  series: Array<{ date: string; bookings: number }>;
  byAttribution: Array<{
    source: string;
    medium: string;
    campaign: string;
    bookings: number;
  }>;
  bookings: Array<{
    uri: string;
    eventName: string | null;
    status: string | null;
    scheduledAt: string;
    inviteeName: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
  }>;
};

export type WebsiteSignalsResponse = {
  range: Range;
  /** The kit's own data contract; imported rather than restated. */
  data: import("@/website-signals-kit/lib/types").WebsiteData;
  freshness: { ga4: Freshness; clarity: Freshness; gsc: Freshness };
};
