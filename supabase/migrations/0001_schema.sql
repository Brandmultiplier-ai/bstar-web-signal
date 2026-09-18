-- ---------------------------------------------------------------------------
-- bstar-web-signals: core schema
--
-- Every third-party metric lands in a table here first. The dashboard reads
-- only from these tables, so a past date never re-triggers an upstream call.
-- All fact tables are keyed so that an overlapping or repeated ingest window
-- upserts rather than double-counts.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Site registry
--
-- The per-source wiring is uneven, so each column is independently nullable
-- and the ingest routes skip a site when its config for that source is null.
--
-- weservefounders.com shares brandmultiplier.ai's GA4 property: both rows
-- carry the same ga4_property_id and are told apart by ga4_hostname_filter.
-- ---------------------------------------------------------------------------
create table if not exists public.sites (
  id                  uuid primary key default gen_random_uuid(),
  slug                text not null unique,
  domain              text not null unique,
  display_name        text not null,

  -- GA4. Sites sharing a property share property_id and are split by hostname.
  ga4_property_id     text,
  ga4_hostname_filter text,

  -- Search Console property, in the exact form the API expects
  -- ("sc-domain:example.com" or "https://example.com/").
  gsc_site_url        text,

  -- Clarity project. Shared across sites; metrics are stored per project, not
  -- per site, because Clarity's API cannot split a project by hostname.
  clarity_project_id  text,

  rb2b_enabled        boolean not null default false,
  is_active           boolean not null default true,
  sort_order          integer not null default 0,
  created_at          timestamptz not null default now()
);

comment on column public.sites.ga4_hostname_filter is
  'Set when the GA4 property serves more than one domain; ingestion filters on GA4 hostName.';

create index if not exists sites_ga4_property_id_idx
  on public.sites (ga4_property_id) where ga4_property_id is not null;

-- ---------------------------------------------------------------------------
-- Ingestion bookkeeping
--
-- One row per attempt. This is the single source of truth for the "last
-- successfully fetched" stamp the dashboard shows, which is what makes a
-- failed or delayed cron run visible instead of silently stale.
-- ---------------------------------------------------------------------------
create table if not exists public.ingestion_runs (
  id           bigint generated always as identity primary key,
  source       text not null check (source in ('ga4', 'gsc', 'clarity', 'calendly', 'rb2b')),
  site_id      uuid references public.sites (id) on delete cascade,
  status       text not null default 'running' check (status in ('running', 'success', 'error')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  window_start date,
  window_end   date,
  rows_written integer not null default 0,
  error        text
);

create index if not exists ingestion_runs_source_status_idx
  on public.ingestion_runs (source, status, finished_at desc);

-- ---------------------------------------------------------------------------
-- GA4 facts
-- ---------------------------------------------------------------------------
create table if not exists public.ga4_daily (
  site_id   uuid not null references public.sites (id) on delete cascade,
  date      date not null,
  sessions  integer not null default 0,
  users     integer not null default 0,
  pageviews integer not null default 0,
  primary key (site_id, date)
);

create table if not exists public.ga4_page_daily (
  site_id   uuid not null references public.sites (id) on delete cascade,
  date      date not null,
  page_path text not null,
  pageviews integer not null default 0,
  sessions  integer not null default 0,
  primary key (site_id, date, page_path)
);

create table if not exists public.ga4_source_daily (
  site_id  uuid not null references public.sites (id) on delete cascade,
  date     date not null,
  source   text not null,
  medium   text not null,
  sessions integer not null default 0,
  users    integer not null default 0,
  primary key (site_id, date, source, medium)
);

-- The five key events from the brief, stored with the page path and placement
-- they fired from. event_key is our stable internal name; the literal GA4
-- event string each one maps to lives in src/lib/sources/ga4-events.ts.
create table if not exists public.ga4_key_events_daily (
  site_id   uuid not null references public.sites (id) on delete cascade,
  date      date not null,
  event_key text not null check (
    event_key in (
      'calendly_outbound_click',
      'form_submission',
      'calculator_completion',
      'gate_open',
      'vsl_play'
    )
  ),
  page_path text not null default '(not set)',
  placement text not null default '(not set)',
  count     integer not null default 0,
  primary key (site_id, date, event_key, page_path, placement)
);

-- ---------------------------------------------------------------------------
-- Search Console facts
-- ---------------------------------------------------------------------------
create table if not exists public.gsc_daily (
  site_id      uuid not null references public.sites (id) on delete cascade,
  date         date not null,
  clicks       integer not null default 0,
  impressions  integer not null default 0,
  ctr          numeric(8, 6) not null default 0,
  avg_position numeric(8, 3) not null default 0,
  primary key (site_id, date)
);

create table if not exists public.gsc_query_daily (
  site_id      uuid not null references public.sites (id) on delete cascade,
  date         date not null,
  query        text not null,
  clicks       integer not null default 0,
  impressions  integer not null default 0,
  ctr          numeric(8, 6) not null default 0,
  avg_position numeric(8, 3) not null default 0,
  primary key (site_id, date, query)
);

-- Index coverage is a point-in-time snapshot, not a daily time series, so we
-- key it by the date we observed it.
create table if not exists public.gsc_index_status (
  site_id           uuid not null references public.sites (id) on delete cascade,
  date              date not null,
  indexed_count     integer not null default 0,
  not_indexed_count integer not null default 0,
  primary key (site_id, date)
);

-- ---------------------------------------------------------------------------
-- Clarity facts
--
-- Keyed by project, not site: the project is shared across brandmultiplier.ai,
-- weservefounders.com and chrisrubincreativ.com and cannot be split apart.
-- Clarity's API returns only the last 1-3 days and cannot backfill, which is
-- why this source runs on a 2-day cadence.
-- ---------------------------------------------------------------------------
create table if not exists public.clarity_daily (
  clarity_project_id    text not null,
  date                  date not null,
  sessions              integer not null default 0,
  unique_users          integer not null default 0,
  rage_click_pct        numeric(8, 4),
  dead_click_pct        numeric(8, 4),
  excessive_scroll_pct  numeric(8, 4),
  quick_back_pct        numeric(8, 4),
  scroll_depth_pct      numeric(8, 4),
  active_time_seconds   numeric(12, 2),
  primary key (clarity_project_id, date)
);

-- ---------------------------------------------------------------------------
-- Calendly bookings
--
-- Not split per site: the booking link is shared and attribution comes from
-- the UTM values carried on the invitee's tracking payload.
-- ---------------------------------------------------------------------------
create table if not exists public.calendly_bookings (
  calendly_uri  text primary key,
  event_name    text,
  status        text,
  scheduled_at  timestamptz not null,
  ended_at      timestamptz,
  booked_at     timestamptz,
  invitee_name  text,
  invitee_email text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  utm_term      text,
  synced_at     timestamptz not null default now()
);

create index if not exists calendly_bookings_scheduled_at_idx
  on public.calendly_bookings (scheduled_at desc);

-- ---------------------------------------------------------------------------
-- RB2B identified visitors
--
-- Pushed to us by webhook in real time rather than pulled on a schedule, so
-- there is no ingest window for this source. site_id is resolved from the
-- captured URL's hostname and left null when it matches no known site, so an
-- unrecognised domain is retained rather than dropped.
-- ---------------------------------------------------------------------------
create table if not exists public.rb2b_visitors (
  id           uuid primary key default gen_random_uuid(),
  site_id      uuid references public.sites (id) on delete set null,
  company      text,
  title        text,
  linkedin_url text,
  captured_url text,
  referrer     text,
  captured_at  timestamptz not null,
  received_at  timestamptz not null default now(),
  raw          jsonb
);

-- RB2B can re-deliver a webhook; the same person hitting the same URL at the
-- same instant is the same event. NULLS NOT DISTINCT so rows with a missing
-- LinkedIn URL still dedupe against each other.
create unique index if not exists rb2b_visitors_dedupe_idx
  on public.rb2b_visitors (linkedin_url, captured_at, captured_url)
  nulls not distinct;

create index if not exists rb2b_visitors_site_captured_idx
  on public.rb2b_visitors (site_id, captured_at desc);

-- ---------------------------------------------------------------------------
-- Freshness view
--
-- security_invoker so the view is subject to the caller's RLS on the base
-- table rather than running as its owner.
-- ---------------------------------------------------------------------------
create or replace view public.source_freshness with (security_invoker = on) as
select
  r.source,
  r.site_id,
  max(r.finished_at) filter (where r.status = 'success') as last_success_at,
  max(r.finished_at) filter (where r.status = 'error')   as last_error_at,
  max(r.started_at)                                      as last_attempt_at
from public.ingestion_runs r
group by r.source, r.site_id;
