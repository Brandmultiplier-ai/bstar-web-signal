-- Clarity must run daily: Microsoft only returns yesterday, and we persist
-- that day forever so 7d / 28d / All time can grow. A 2-day cadence would
-- skip stored days that cannot be recovered later.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'ingest-clarity') then
    perform cron.unschedule('ingest-clarity');
  end if;

  perform cron.schedule(
    'ingest-clarity',
    '0 5 * * *',
    'select private.trigger_ingest(''clarity'')'
  );
end $$;
