-- ---------------------------------------------------------------------------
-- Daily page-meta pull at 06:45 UTC, after GA4 (06:00) has refreshed the top
-- pages it reads. It fetches the public HTML of each site's top pages; it
-- calls no analytics API.
--
-- ingestion_runs only accepted the original five sources, so the check is
-- widened to record page-meta runs. Existing rows are not touched.
-- ---------------------------------------------------------------------------

alter table public.ingestion_runs drop constraint if exists ingestion_runs_source_check;
alter table public.ingestion_runs add constraint ingestion_runs_source_check
  check (source in ('ga4', 'gsc', 'clarity', 'calendly', 'rb2b', 'page-meta'));

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingest-page-meta') then
    perform cron.unschedule('ingest-page-meta');
  end if;

  perform cron.schedule(
    'ingest-page-meta',
    '45 6 * * *',
    format('select private.trigger_ingest(%L)', 'page-meta')
  );
end $$;
