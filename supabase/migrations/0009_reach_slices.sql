-- Extra stored slices so the dashboard can show landing pages, OS mix, and
-- richer page detail from the database. Date chips never call Google or Clarity.

-- ---------------------------------------------------------------------------
-- GA4 pages: users and engaged sessions (engagement rate per path)
-- ---------------------------------------------------------------------------
alter table public.ga4_page_daily
  add column if not exists users integer not null default 0,
  add column if not exists engaged_sessions integer not null default 0;

-- Where sessions started (landing page), distinct from all pageviews.
create table if not exists public.ga4_landing_daily (
  site_id              uuid not null references public.sites (id) on delete cascade,
  date                 date not null,
  page_path            text not null,
  sessions             integer not null default 0,
  users                integer not null default 0,
  bounce_rate          numeric(8, 6),
  avg_session_duration numeric(12, 2),
  engaged_sessions     integer not null default 0,
  primary key (site_id, date, page_path)
);

-- Operating system mix (Windows / macOS / iOS / Android / …)
create table if not exists public.ga4_os_daily (
  site_id   uuid not null references public.sites (id) on delete cascade,
  date      date not null,
  os        text not null,
  sessions  integer not null default 0,
  users     integer not null default 0,
  primary key (site_id, date, os)
);

-- ---------------------------------------------------------------------------
-- Clarity: OS joins device / browser / source / country
-- ---------------------------------------------------------------------------
alter table public.clarity_breakdown_daily
  drop constraint if exists clarity_breakdown_daily_dimension_check;

alter table public.clarity_breakdown_daily
  add constraint clarity_breakdown_daily_dimension_check
  check (dimension in ('device', 'browser', 'source', 'country', 'os'));

-- ---------------------------------------------------------------------------
-- RLS: authenticated read, service-role write
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['ga4_landing_daily', 'ga4_os_daily']
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
