-- Where sessions that started on a page came from: one row per site, day,
-- landing page, source and medium. Feeds the Traffic sources block in the
-- page drill-in. Written by the GA4 ingest with the service role; the
-- dashboard and signals_reader only read it.

create table if not exists public.ga4_landing_source_daily (
  site_id    uuid not null references public.sites (id) on delete cascade,
  date       date not null,
  page_path  text not null,
  source     text not null,
  medium     text not null,
  sessions   integer not null default 0,
  users      integer not null default 0,
  primary key (site_id, date, page_path, source, medium)
);

alter table public.ga4_landing_source_daily enable row level security;

drop policy if exists ga4_landing_source_daily_select_authenticated
  on public.ga4_landing_source_daily;
create policy ga4_landing_source_daily_select_authenticated
  on public.ga4_landing_source_daily for select to authenticated using (true);

grant select on table public.ga4_landing_source_daily to authenticated;
grant select on table public.ga4_landing_source_daily to signals_reader;
