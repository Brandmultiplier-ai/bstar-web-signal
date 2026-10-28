-- ---------------------------------------------------------------------------
-- Anonymous form captures
--
-- POST /api/webhooks/capture writes one row per submission. Only the columns
-- below are stored; personal fields are dropped by the route before insert.
--
-- RLS is enabled with no policies. anon and authenticated therefore have no
-- Data API access. signals_reader bypasses RLS and would otherwise inherit
-- SELECT from the default privileges in 0013, so that grant is revoked too.
-- The capture route writes with the service-role key, which bypasses RLS.
-- ---------------------------------------------------------------------------

create table if not exists public.form_captures (
  id           uuid primary key default gen_random_uuid(),
  form_id      text not null,
  intent       text,
  page_url     text,
  site_domain  text,
  utm_source   text,
  utm_medium   text,
  utm_campaign text,
  utm_content  text,
  submitted_at timestamptz,
  received_at  timestamptz not null default now()
);

alter table public.form_captures enable row level security;

revoke all on table public.form_captures from anon, authenticated, signals_reader;
grant all on table public.form_captures to service_role;

create index if not exists form_captures_received_at_idx
  on public.form_captures (received_at);

create index if not exists form_captures_form_id_received_at_idx
  on public.form_captures (form_id, received_at);
