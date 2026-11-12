-- Speeds the page drill-in, which reads one page's sources for a date range.
-- Not applied yet.

create index if not exists ga4_landing_source_daily_site_path_date_idx
  on public.ga4_landing_source_daily (site_id, page_path, date);
