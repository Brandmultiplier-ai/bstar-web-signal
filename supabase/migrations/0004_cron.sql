-- ---------------------------------------------------------------------------
-- Scheduling
--
-- pg_cron can only run SQL, so pg_net makes the outbound HTTPS call into our
-- own Next.js ingest routes, which own the third-party API clients.
--
-- Before the jobs will do anything, set the deploy's base URL and the shared
-- secret (these are not in the migration because they differ per environment):
--
--   insert into private.ingest_config (base_url, ingest_secret)
--   values ('https://your-app.vercel.app', '<INGEST_SECRET>')
--   on conflict (id) do update
--     set base_url = excluded.base_url,
--         ingest_secret = excluded.ingest_secret;
-- ---------------------------------------------------------------------------

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schema is not exposed through the API, so the secret is never reachable
-- over PostgREST even with a valid anon key.
create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.ingest_config (
  id            boolean primary key default true check (id),
  base_url      text not null,
  ingest_secret text not null
);

-- ---------------------------------------------------------------------------
-- Fires one ingest route. Returns immediately: pg_net is asynchronous, so the
-- cron job's own success only means the request was queued. Whether the
-- ingest itself worked is recorded in public.ingestion_runs by the route.
-- ---------------------------------------------------------------------------
create or replace function private.trigger_ingest(source text)
returns bigint
language plpgsql
security definer
set search_path = private, public
as $$
declare
  config private.ingest_config;
  request_id bigint;
begin
  select * into config from private.ingest_config where id;

  if config is null then
    raise exception 'private.ingest_config is empty; cannot trigger ingest for %', source;
  end if;

  select net.http_post(
    url     := config.base_url || '/api/ingest/' || source,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-secret', config.ingest_secret
    ),
    body    := '{}'::jsonb,
    -- Generous: a wide GA4 window with several breakdowns is not quick.
    timeout_milliseconds := 280000
  ) into request_id;

  return request_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Job registration. Unscheduled first so the migration is re-runnable.
--
-- Clarity every 2 days because its API only exposes the last 1-3 days and
-- cannot backfill. GA4, Search Console and Calendly every 3 days, staggered so
-- they do not contend for the same function invocation window.
-- ---------------------------------------------------------------------------
do $$
declare
  job record;
begin
  for job in
    select * from (values
      ('ingest-clarity',  '0 5 */2 * *', 'clarity'),
      ('ingest-ga4',      '0 6 */3 * *', 'ga4'),
      ('ingest-gsc',      '15 6 */3 * *', 'gsc'),
      ('ingest-calendly', '30 6 */3 * *', 'calendly')
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
