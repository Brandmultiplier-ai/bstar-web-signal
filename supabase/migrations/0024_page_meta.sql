-- What each top page says about itself: its title, meta description and
-- first heading, read from the live HTML once a day by the page-meta ingest.
-- Feeds "What this page is" in the page views. Written by the ingest with the
-- service role; the dashboard and signals_reader only read it.

create table if not exists public.page_meta (
  site_id        uuid not null references public.sites (id) on delete cascade,
  page_path      text not null,
  url            text,
  status_code    integer,
  title          text,
  description    text,
  h1             text,
  canonical_url  text,
  error          text,
  fetched_at     timestamptz,
  checked_at     timestamptz not null default now(),
  primary key (site_id, page_path)
);

alter table public.page_meta enable row level security;

drop policy if exists page_meta_select_authenticated on public.page_meta;
create policy page_meta_select_authenticated
  on public.page_meta for select to authenticated using (true);

grant select on table public.page_meta to authenticated;
grant select on table public.page_meta to signals_reader;
