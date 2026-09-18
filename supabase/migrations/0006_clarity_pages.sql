-- ---------------------------------------------------------------------------
-- Per-URL Clarity metrics
--
-- Clarity's live-insights endpoint accepts dimension1=URL, which returns every
-- metric broken down per page rather than as a single project aggregate. That
-- changes two things we had previously treated as impossible:
--
--   1. The shared Clarity project CAN be split per site, by reading the
--      hostname out of the returned URL.
--   2. Scroll depth and active time ARE available per page.
--
-- clarity_daily stays as the project-wide daily rollup. This table is the
-- per-page grain underneath it.
-- ---------------------------------------------------------------------------

create table if not exists public.clarity_page_daily (
  clarity_project_id   text not null,
  date                 date not null,
  page_path            text not null,
  -- Resolved from the URL hostname. Null when the host matches no known site,
  -- so an unrecognised domain is retained rather than dropped.
  site_id              uuid references public.sites (id) on delete set null,
  host                 text not null,
  sessions             integer not null default 0,
  distinct_users       integer not null default 0,
  scroll_depth_pct     numeric(8, 4),
  active_time_seconds  numeric(12, 2),
  total_time_seconds   numeric(12, 2),
  rage_click_pct       numeric(8, 4),
  dead_click_pct       numeric(8, 4),
  excessive_scroll_pct numeric(8, 4),
  quick_back_pct       numeric(8, 4),
  script_error_pct     numeric(8, 4),
  primary key (clarity_project_id, date, page_path)
);

create index if not exists clarity_page_daily_site_date_idx
  on public.clarity_page_daily (site_id, date);

create index if not exists clarity_page_daily_sessions_idx
  on public.clarity_page_daily (site_id, date, sessions desc);

alter table public.clarity_page_daily enable row level security;

drop policy if exists clarity_page_daily_select_authenticated on public.clarity_page_daily;
create policy clarity_page_daily_select_authenticated
  on public.clarity_page_daily for select to authenticated using (true);

grant select on table public.clarity_page_daily to authenticated;

comment on table public.clarity_page_daily is
  'Per-page Clarity metrics from a dimension1=URL live-insights call. site_id is derived from the URL host.';
