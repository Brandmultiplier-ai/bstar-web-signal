import type { Ga4EventKey } from "@/lib/database.types";

export type Freshness = {
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  /** Present when the latest successful pull left a gate warning or a partial failure. */
  note?: string | null;
  /** Present when the latest failed run recorded which project failed. */
  failureMessage?: string | null;
};
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
    daily: Array<{ date: string; clicks: number; impressions: number }>;
  }>;
  /** Clicks represented by the query table versus clicks on the daily totals. */
  queryCoverage: { clicksInTable: number; clicksTotal: number };
  positionBands: Array<{ band: string; queries: number; clicks: number; impressions: number }>;
  indexStatus: { observedOn: string; indexed: number; notIndexed: number } | null;
  indexTrend: Array<{ date: string; indexed: number; notIndexed: number }>;
};

export type SummarySection = "ga4" | "gsc" | "clarity" | "calendly" | "leads";

export type SummaryKpi = {
  id: string;
  label: string;
  section: SummarySection;
  format: "number" | "percent" | "position";
  goodWhen: "up" | "down";
} & (
  | { available: true; current: number; previous: number | null; change: number | null }
  | { available: false; reason: string }
);

export type Mover = { key: string; current: number; previous: number; difference: number };
export type MoverSet = { risers: Mover[]; fallers: Mover[] };

export type SummaryDay = { date: string; sessions: number | null; clicks: number | null };
export type SummaryInsight = { tone: "good" | "bad" | "neutral"; text: string };

export type SummaryResponse = {
  range: Range & { allTime?: boolean };
  /** Null for an all-time range, which has no earlier window to compare with. */
  previous: Range | null;
  kpis: SummaryKpi[];
  changed: { pages: MoverSet; queries: MoverSet; channels: MoverSet } | null;
  /** One entry per day; `previous` is the same day offset in the earlier window. Null values mean no stored row. */
  daily: Array<{ current: SummaryDay; previous: SummaryDay | null }>;
  insights: SummaryInsight[];
  freshness: { ga4: Freshness; gsc: Freshness; clarity: Freshness; calendly: Freshness; rb2b: Freshness };
};

type Unavailable = { available: false; reason: string };
type Ranked = Array<{ name: string; value: number }>;

export type LeadsResponse = {
  range: Range;
  companies:
    | {
        available: true;
        totals: { visits: number; companies: number; unidentifiedVisits: number };
        series: Array<{ date: string; visits: number }>;
        companies: Array<{
          company: string;
          visits: number;
          pages: string[];
          titles: string[];
          firstSeen: string;
          lastSeen: string;
        }>;
        topPages: Ranked;
        referrers: Ranked;
      }
    | Unavailable;
  forms:
    | {
        available: true;
        totals: { submissions: number };
        series: Array<{ date: string; submissions: number }>;
        byForm: Ranked;
        byPage: Ranked;
        bySource: Ranked;
        recent: Array<{
          at: string;
          formId: string;
          intent: string | null;
          page: string;
          source: string | null;
          medium: string | null;
          campaign: string | null;
        }>;
      }
    | Unavailable;
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
  totals: {
    primary: number;
    partner: number;
    relay: number;
    cancelled: number;
    excluded: number;
    attributionGaps: number;
  };
  byProperty: Array<{ property: string; bookings: number }>;
  series: Array<{
    date: string;
    conversionClass: "primary" | "partner" | "relay" | "excluded";
    bookings: number;
  }>;
  byAttribution: Array<{
    source: string;
    medium: string;
    campaign: string;
    conversionClass: "primary" | "partner" | "relay" | "excluded";
    bookings: number;
  }>;
  byExclusion: Array<{ reason: string; eventName: string; bookings: number }>;
  bookings: Array<{
    uri: string;
    eventName: string | null;
    eventSlug: string | null;
    conversionClass: "primary" | "partner" | "relay" | "excluded";
    property: string | null;
    exclusionReason: string | null;
    status: string | null;
    countedOn: string;
    scheduledAt: string;
    inviteeName: string | null;
    utmSource: string | null;
    utmMedium: string | null;
    utmCampaign: string | null;
    utmContent: string | null;
    utmTerm: string | null;
  }>;
};

export type PageDetailResponse = Omit<import("@/lib/read/page-detail").PageDetail, "conversions"> & {
  range: Range & { allTime?: boolean };
  previous: Range | null;
  path: string;
  site: { domain: string; hasGa4: boolean; clarityProjectId: string | null };
  /** Earliest stored day for the whole site, so a new site can say when collection began. */
  firstStored: { ga4: string | null; clarity: string | null };
  conversions: Array<{ eventKey: string; label: string; placement: string; count: number }>;
};

export type WebsiteSignalsResponse = {
  range: Range;
  /** The kit's own data contract; imported rather than restated. */
  data: import("@/website-signals-kit/lib/types").WebsiteData;
  freshness: { ga4: Freshness; clarity: Freshness; gsc: Freshness; calendly: Freshness };
};
