-- ---------------------------------------------------------------------------
-- Row level security
--
-- Signed-in users get read-only access to everything. Nothing gets an insert,
-- update or delete policy: all writes come from the ingest routes and the RB2B
-- webhook using the service-role key, which bypasses RLS. That means a leaked
-- anon key can read metrics but cannot forge them.
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  readable_tables text[] := array[
    'sites',
    'ingestion_runs',
    'ga4_daily',
    'ga4_page_daily',
    'ga4_source_daily',
    'ga4_key_events_daily',
    'gsc_daily',
    'gsc_query_daily',
    'gsc_index_status',
    'clarity_daily',
    'calendly_bookings',
    'rb2b_visitors'
  ];
begin
  foreach t in array readable_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_authenticated', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      t || '_select_authenticated',
      t
    );
  end loop;
end $$;
