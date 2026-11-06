-- ---------------------------------------------------------------------------
-- One cron job per platform, on that platform's own update cadence. Each job
-- calls /api/ingest/<source>, which pulls every active site in one run.
--
--   Clarity   daily 05:00 UTC   API returns only the last 1-3 days, 10 calls
--                               per project per day. A skipped day is lost.
--   GA4       daily 06:00 UTC   A day is processed within 24-48 hours. The
--                               10-day lookback re-reads late-processed days.
--   Search    daily 06:15 UTC   Data lands with a 2-3 day lag. The 10-day
--   Console                     lookback picks each day up once it is final.
--   Calendly  every 12 hours    Bookings appear in the API in real time.
--             06:30, 18:30 UTC
--
-- The schedule replaces the jobs from 0004_cron.sql and 0011. Stored history
-- is not touched.
-- ---------------------------------------------------------------------------

do $$
declare
  job record;
begin
  for job in
    select * from (values
      ('ingest-clarity',  '0 5 * * *',      'clarity'),
      ('ingest-ga4',      '0 6 * * *',      'ga4'),
      ('ingest-gsc',      '15 6 * * *',     'gsc'),
      ('ingest-calendly', '30 6,18 * * *',  'calendly')
    ) as t(job_name, schedule, source)
  loop
    if exists (select 1 from cron.job where jobname = job.job_name) then
      perform cron.unschedule(job.job_name);
    end if;

    perform cron.schedule(
      job.job_name,
      job.schedule,
      format('select private.trigger_ingest(%L)', job.source)
    );
  end loop;
end $$;
