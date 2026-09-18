export interface KPIMetric {
  value: number;
  change: number;
  sparkline: number[];
  suffix?: string;
}

export interface SectionTldr {
  summary: string;
  actions: {
    title: string;
    description: string;
    priority: "high" | "medium" | "low";
    cta: string;
  }[];
}

export interface CountryRow {
  code: string;
  name: string;
  flag: string;
  traffic: number;
  trafficChange: number;
  lat: number;
  lon: number;
}

/**
 * Fields marked optional are ones a given backend may not be able to source.
 * The UI hides the corresponding column or panel rather than showing a
 * fabricated value. RB2B, for example, supplies company, title and LinkedIn
 * URL but no industry, company size, intent or lead score.
 */
export interface CompanySignal {
  id: string;
  company: string;
  pagesVisited: number;
  source: string;
  pages: string[];
  linkedinUrl: string;
  title?: string;
  lastSeen?: string;
  industry?: string;
  signalScore?: number;
  timeOnSite?: string;
  intent?: "hot" | "warm" | "cold";
  companySize?: string;
}

export interface FunnelStep {
  label: string;
  sessions: number;
  dropoffPct: number;
}

export interface TopPage {
  url: string;
  sessions: number;
  /** Per-page scroll depth and exit rate are not available from GA4 or
   * Clarity's APIs; omit them and the bars are hidden. */
  scrollDepth?: number;
  exitRate?: number;
}

export interface SessionRecording {
  id: string;
  page: string;
  duration: string;
  flags: ("rage-click" | "dead-click" | "quick-back" | "js-error")[];
  country: string;
  device: "desktop" | "mobile" | "tablet";
}

export interface WebsiteData {
  sessions: KPIMetric;
  rageclickRate?: KPIMetric;
  deadclickRate?: KPIMetric;
  scrollDepth?: KPIMetric;
  jsErrors?: KPIMetric;
  quickBackRate?: KPIMetric;
  visitorTrend: { date: string; value: number }[];
  trafficSources: { name: string; value: number }[];
  visitorCountries: CountryRow[];
  topPages: TopPage[];
  funnelSteps: FunnelStep[];
  signals: CompanySignal[];

  /**
   * Optional panels. Each is omitted when the backend cannot source it, and
   * the section hides that panel instead of rendering a placeholder:
   *  - tldr: narrative summary, generated per-app rather than fetched.
   *  - readingBehavior: Clarity does not expose engagement buckets by API.
   *  - sessionRecordings: Clarity has no API for listing recordings.
   */
  tldr?: SectionTldr;
  readingBehavior?: { label: string; pct: number; sessions: number; color: string }[];
  sessionRecordings?: SessionRecording[];

  /**
   * Appended to the behavioral KPI tooltips. Lets a backend state the real
   * scope of those metrics when it differs from the rest of the view — for
   * example a Clarity project shared across several domains.
   */
  behaviorScopeNote?: string;

  /**
   * Appended to the Sessions tooltip. Lets a backend disclose when traffic was
   * counted by a different tool than usual.
   */
  sessionsNote?: string;
}
