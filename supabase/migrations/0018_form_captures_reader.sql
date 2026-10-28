-- ---------------------------------------------------------------------------
-- signals_reader may read form captures. Select only.
--
-- Columns are only id, form_id, intent, page_url, site_domain, utm_source,
-- utm_medium, utm_campaign, utm_content, submitted_at, and received_at.
-- The capture route inserts only those fields. No personal data is stored.
--
-- anon and authenticated stay revoked. service_role remains the only writer.
-- signals_reader already bypasses RLS (0013); the grant is what admits the
-- read, and the policy names the same select-all access as the other tables.
-- ---------------------------------------------------------------------------

alter table public.form_captures enable row level security;

drop policy if exists form_captures_select_signals_reader on public.form_captures;
create policy form_captures_select_signals_reader
  on public.form_captures for select to signals_reader using (true);

grant select on table public.form_captures to signals_reader;
revoke insert, update, delete, truncate on table public.form_captures from signals_reader;

revoke all on table public.form_captures from anon, authenticated;
