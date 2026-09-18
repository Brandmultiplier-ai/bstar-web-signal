-- Richer stored slices for GA4 and Clarity. Date filters read these tables
-- only; nothing here is fetched live from Google or Microsoft.

-- ---------------------------------------------------------------------------
-- GA4 daily: engagement, new users, duration
-- ---------------------------------------------------------------------------
alter table public.ga4_daily
  add column if not exists new_users integer not null default 0,
  add column if not exists engaged_sessions integer not null default 0,
  add column if not exists bounce_rate numeric(8, 6),
  add column if not exists avg_session_duration numeric(12, 2);

alter table public.ga4_page_daily
  add column if not exists bounce_rate numeric(8, 6),
  add column if not exists avg_session_duration numeric(12, 2);

-- Device category (desktop / mobile / tablet)
create table if not exists public.ga4_device_daily (
  site_id   uuid not null references public.sites (id) on delete cascade,
  date      date not null,
  device    text not null,
  sessions  integer not null default 0,
  users     integer not null default 0,
  primary key (site_id, date, device)
);

-- GA4 default channel group (Organic Search, Direct, Referral, ...)
create table if not exists public.ga4_channel_daily (
  site_id   uuid not null references public.sites (id) on delete cascade,
  date      date not null,
  channel   text not null,
  sessions  integer not null default 0,
  users     integer not null default 0,
  primary key (site_id, date, channel)
);

-- ---------------------------------------------------------------------------
-- Clarity: per-dimension daily breakdowns (Device, Browser, Source, Country)
-- ---------------------------------------------------------------------------
create table if not exists public.clarity_breakdown_daily (
  clarity_project_id text not null,
  date               date not null,
  dimension          text not null check (dimension in ('device', 'browser', 'source', 'country')),
  key                text not null,
  sessions           integer not null default 0,
  distinct_users     integer not null default 0,
  primary key (clarity_project_id, date, dimension, key)
);

-- Homepages of two sites both have path '/'. Include host in the key so they
-- do not overwrite each other.
alter table public.clarity_page_daily drop constraint if exists clarity_page_daily_pkey;
alter table public.clarity_page_daily
  add primary key (clarity_project_id, date, host, page_path);

-- ---------------------------------------------------------------------------
-- RLS: authenticated read, service-role write
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ga4_device_daily', 'ga4_channel_daily', 'clarity_breakdown_daily']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_authenticated',
      t
    );
    execute format('grant select on table public.%I to authenticated', t);
  end loop;
end $$;
