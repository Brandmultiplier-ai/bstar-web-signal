-- ---------------------------------------------------------------------------
-- Additions needed by the Website Signals view
--
-- Two gaps the original five sources did not cover:
--   1. The traffic globe needs sessions broken down by country, which GA4 can
--      provide but we were not requesting.
--   2. The JS Errors KPI needs Clarity's ScriptErrorCount, which the
--      live-insights response already returns alongside the other rates.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- GA4 sessions by country
--
-- country_code is GA4's `countryId`, an ISO 3166-1 alpha-2 value. It is the
-- join key to the lat/lon and flag lookup the globe renders from, so rows
-- without one are useless for the map and are dropped at ingest.
-- ---------------------------------------------------------------------------
create table if not exists public.ga4_country_daily (
  site_id      uuid not null references public.sites (id) on delete cascade,
  date         date not null,
  country_code text not null,
  country_name text not null,
  sessions     integer not null default 0,
  users        integer not null default 0,
  primary key (site_id, date, country_code)
);

create index if not exists ga4_country_daily_site_date_idx
  on public.ga4_country_daily (site_id, date);

alter table public.ga4_country_daily enable row level security;

drop policy if exists ga4_country_daily_select_authenticated on public.ga4_country_daily;
create policy ga4_country_daily_select_authenticated
  on public.ga4_country_daily for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- Clarity script errors
--
-- Nullable for the same reason as the other Clarity rates: the value is only
-- exact for a day captured by a 1-day pull, and Clarity cannot decompose a
-- multi-day aggregate into its days.
-- ---------------------------------------------------------------------------
alter table public.clarity_daily
  add column if not exists script_error_pct numeric(8, 4);

comment on column public.clarity_daily.script_error_pct is
  'Percentage of sessions with a JavaScript error, from Clarity ScriptErrorCount.';
