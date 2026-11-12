/**
 * Hand-maintained mirror of supabase/migrations. Keep in sync when the schema
 * changes, or regenerate with:
 *   supabase gen types typescript --project-id <id> --schema public
 */

export type IngestSource = "ga4" | "gsc" | "clarity" | "calendly" | "rb2b" | "page-meta";
export type IngestStatus = "running" | "success" | "error";

export type Ga4EventKey =
  | "calendly_outbound_click"
  | "form_submission"
  | "calculator_completion"
  | "gate_open"
  | "vsl_play";

export type Site = {
  id: string;
  slug: string;
  domain: string;
  display_name: string;
  ga4_property_id: string | null;
  ga4_hostname_filter: string | null;
  gsc_site_url: string | null;
  clarity_project_id: string | null;
  rb2b_enabled: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
};

export type IngestionRun = {
  id: number;
  source: IngestSource;
  site_id: string | null;
  status: IngestStatus;
  started_at: string;
  finished_at: string | null;
  window_start: string | null;
  window_end: string | null;
  rows_written: number;
  error: string | null;
};

export type Ga4Daily = {
  site_id: string;
  date: string;
  sessions: number;
  users: number;
  pageviews: number;
  new_users: number;
  engaged_sessions: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
};

export type Ga4PageDaily = {
  site_id: string;
  date: string;
  page_path: string;
  pageviews: number;
  sessions: number;
  users: number;
  engaged_sessions: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
};

export type Ga4LandingDaily = {
  site_id: string;
  date: string;
  page_path: string;
  sessions: number;
  users: number;
  bounce_rate: number | null;
  avg_session_duration: number | null;
  engaged_sessions: number;
};

export type Ga4LandingSourceDaily = {
  site_id: string;
  date: string;
  page_path: string;
  source: string;
  medium: string;
  sessions: number;
  users: number;
};

export type Ga4OsDaily = {
  site_id: string;
  date: string;
  os: string;
  sessions: number;
  users: number;
};

export type Ga4SourceDaily = {
  site_id: string;
  date: string;
  source: string;
  medium: string;
  sessions: number;
  users: number;
};

export type Ga4DeviceDaily = {
  site_id: string;
  date: string;
  device: string;
  sessions: number;
  users: number;
};

export type Ga4ChannelDaily = {
  site_id: string;
  date: string;
  channel: string;
  sessions: number;
  users: number;
};

export type Ga4KeyEventDaily = {
  site_id: string;
  date: string;
  event_key: Ga4EventKey;
  page_path: string;
  placement: string;
  count: number;
};

export type Ga4CountryDaily = {
  site_id: string;
  date: string;
  country_code: string;
  country_name: string;
  sessions: number;
  users: number;
};

export type GscDaily = {
  site_id: string;
  date: string;
  clicks: number;
  impressions: number;
  ctr: number;
  avg_position: number;
};

export type GscQueryDaily = GscDaily & { query: string };

export type GscIndexStatus = {
  site_id: string;
  date: string;
  indexed_count: number;
  not_indexed_count: number;
};

export type ClarityDaily = {
  clarity_project_id: string;
  date: string;
  sessions: number;
  unique_users: number;
  rage_click_pct: number | null;
  dead_click_pct: number | null;
  excessive_scroll_pct: number | null;
  quick_back_pct: number | null;
  scroll_depth_pct: number | null;
  active_time_seconds: number | null;
  script_error_pct: number | null;
};

export type ClarityPageDaily = {
  clarity_project_id: string;
  date: string;
  page_path: string;
  /** Null when the URL host matches no site in the registry. */
  site_id: string | null;
  host: string;
  sessions: number;
  distinct_users: number;
  scroll_depth_pct: number | null;
  active_time_seconds: number | null;
  total_time_seconds: number | null;
  rage_click_pct: number | null;
  dead_click_pct: number | null;
  excessive_scroll_pct: number | null;
  quick_back_pct: number | null;
  script_error_pct: number | null;
};

export type ClarityBreakdownDaily = {
  clarity_project_id: string;
  date: string;
  dimension: "device" | "browser" | "source" | "country" | "os";
  key: string;
  sessions: number;
  distinct_users: number;
};

export type CalendlyBooking = {
  calendly_uri: string;
  event_name: string | null;
  event_type_uri: string | null;
  event_slug: string | null;
  status: string | null;
  scheduled_at: string;
  ended_at: string | null;
  booked_at: string | null;
  invitee_name: string | null;
  invitee_email: string | null;
  invitee_uri: string | null;
  rescheduled: boolean | null;
  old_invitee_uri: string | null;
  new_invitee_uri: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  synced_at: string;
};

export type Rb2bVisitor = {
  id: string;
  site_id: string | null;
  company: string | null;
  title: string | null;
  linkedin_url: string | null;
  captured_url: string | null;
  referrer: string | null;
  captured_at: string;
  received_at: string;
  raw: unknown;
};

/** Anonymous form webhook. No personal fields. Service role is the only writer. */
export type FormCapture = {
  id: string;
  form_id: string;
  intent: string | null;
  page_url: string | null;
  site_domain: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  submitted_at: string | null;
  received_at: string;
};

/** What a page says about itself, read from its live HTML once a day. */
export type PageMeta = {
  site_id: string;
  page_path: string;
  /** Final URL after redirects. */
  url: string | null;
  status_code: number | null;
  title: string | null;
  description: string | null;
  h1: string | null;
  canonical_url: string | null;
  /** Why the last read failed, if it did. */
  error: string | null;
  /** Last successful read. A failed read leaves the previous text in place. */
  fetched_at: string | null;
  checked_at: string;
};

/** One Clarity session, with its link to the replay in Clarity. */
export type ClarityRecording = {
  clarity_project_id: string;
  session_id: string;
  site_id: string | null;
  started_at: string | null;
  duration_seconds: number | null;
  entry_url: string | null;
  exit_url: string | null;
  visited_paths: string[];
  page_count: number | null;
  click_count: number | null;
  device: string | null;
  browser: string | null;
  country: string | null;
  referrer: string | null;
  recording_url: string | null;
  raw: unknown;
  collected_at: string;
};

export type SourceFreshness = {
  source: IngestSource;
  site_id: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_attempt_at: string | null;
};

/** Shape `@supabase/supabase-js` expects for its generic parameter. */
type Table<Row, Insert = Row> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Insert>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      sites: Table<Site, Partial<Site>>;
      ingestion_runs: Table<IngestionRun, Partial<IngestionRun>>;
      ga4_daily: Table<Ga4Daily>;
      ga4_page_daily: Table<Ga4PageDaily>;
      ga4_source_daily: Table<Ga4SourceDaily>;
      ga4_key_events_daily: Table<Ga4KeyEventDaily>;
      ga4_country_daily: Table<Ga4CountryDaily>;
      ga4_device_daily: Table<Ga4DeviceDaily>;
      ga4_channel_daily: Table<Ga4ChannelDaily>;
      ga4_landing_daily: Table<Ga4LandingDaily>;
      ga4_landing_source_daily: Table<Ga4LandingSourceDaily>;
      ga4_os_daily: Table<Ga4OsDaily>;
      gsc_daily: Table<GscDaily>;
      gsc_query_daily: Table<GscQueryDaily>;
      gsc_index_status: Table<GscIndexStatus>;
      clarity_daily: Table<ClarityDaily, Partial<ClarityDaily>>;
      clarity_page_daily: Table<ClarityPageDaily, Partial<ClarityPageDaily>>;
      clarity_breakdown_daily: Table<ClarityBreakdownDaily>;
      calendly_bookings: Table<CalendlyBooking, Partial<CalendlyBooking>>;
      rb2b_visitors: Table<Rb2bVisitor, Partial<Rb2bVisitor>>;
      form_captures: Table<FormCapture, Partial<FormCapture> & Pick<FormCapture, "form_id">>;
      page_meta: Table<PageMeta, Partial<PageMeta> & Pick<PageMeta, "site_id" | "page_path">>;
      clarity_recordings: Table<
        ClarityRecording,
        Partial<ClarityRecording> & Pick<ClarityRecording, "clarity_project_id" | "session_id">
      >;
    };
    Views: {
      source_freshness: { Row: SourceFreshness; Relationships: [] };
    };
    Functions: {
      ingest_delivery_status: {
        Args: Record<PropertyKey, never>;
        Returns: Array<{
          source: string;
          cron_status: string | null;
          cron_ended_at: string | null;
          http_status: number | null;
          http_timed_out: boolean | null;
          http_at: string | null;
        }>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
