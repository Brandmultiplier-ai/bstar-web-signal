-- ---------------------------------------------------------------------------
-- Scheduled-pull delivery, readable by the signed-in dashboard.
--
-- pg_cron and pg_net record a failure that never opens public.ingestion_runs
-- (the job raised, or the HTTP call timed out / returned an error). Those
-- schemas are not granted to the dashboard role. This function returns only
-- the status facts: no command text, headers, URLs, response bodies, or secrets.
--
-- It does not change cron schedules and does not write to fact tables.
-- Not applied by the app. Apply it in the Supabase SQL editor when ready.
-- ---------------------------------------------------------------------------

create or replace function public.ingest_delivery_status()
returns table (
  source text,
  cron_status text,
  cron_ended_at timestamptz,
  http_status integer,
  http_timed_out boolean,
  http_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with latest as (
    select distinct on (j.jobname)
      case j.jobname
        when 'ingest-ga4' then 'ga4'
        when 'ingest-gsc' then 'gsc'
        when 'ingest-clarity' then 'clarity'
        when 'ingest-calendly' then 'calendly'
      end as source,
      d.status as cron_status,
      d.end_time as cron_ended_at,
      d.return_message
    from cron.job j
    join cron.job_run_details d on d.jobid = j.jobid
    where j.jobname in ('ingest-ga4', 'ingest-gsc', 'ingest-clarity', 'ingest-calendly')
    order by j.jobname, d.start_time desc nulls last
  )
  select
    latest.source,
    latest.cron_status,
    latest.cron_ended_at,
    resp.status_code,
    resp.timed_out,
    resp.created
  from latest
  left join net._http_response resp
    on latest.cron_status = 'succeeded'
   and latest.return_message ~ '[0-9]+'
   and resp.id = substring(latest.return_message from '([0-9]+)')::bigint
  where latest.source is not null;
$$;

revoke all on function public.ingest_delivery_status() from public;
revoke all on function public.ingest_delivery_status() from anon;
grant execute on function public.ingest_delivery_status() to authenticated;

comment on function public.ingest_delivery_status() is
  'Latest cron and HTTP status for scheduled ingests. No secrets or response bodies.';
