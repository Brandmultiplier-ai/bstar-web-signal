-- ---------------------------------------------------------------------------
-- Signed-in dashboard users may read form captures. Select only.
--
-- The table holds no personal fields (form_id, intent, page_url, site_domain,
-- utm_*, timestamps). The Leads tab reads it as the signed-in user, so RLS
-- still applies and anon stays revoked. service_role remains the only writer.
-- ---------------------------------------------------------------------------

drop policy if exists form_captures_select_authenticated on public.form_captures;
create policy form_captures_select_authenticated
  on public.form_captures for select to authenticated using (true);

grant select on table public.form_captures to authenticated;
revoke insert, update, delete, truncate on table public.form_captures from authenticated;
