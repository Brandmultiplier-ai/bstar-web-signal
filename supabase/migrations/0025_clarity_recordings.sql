-- Clarity sessions with a link to each replay in Clarity. One row per
-- session, from one daily call per project to the session recordings
-- endpoint. Replays stay in Clarity; only the link and session facts are
-- stored. `raw` keeps the whole session object as returned. Written by the
-- Clarity ingest with the service role; the dashboard and signals_reader only
-- read it.

create table if not exists public.clarity_recordings (
  clarity_project_id  text not null,
  session_id          text not null,
  site_id             uuid references public.sites (id) on delete set null,
  started_at          timestamptz,
  duration_seconds    numeric,
  entry_url           text,
  exit_url            text,
  visited_paths       text[] not null default '{}',
  page_count          integer,
  click_count         integer,
  device              text,
  browser             text,
  country             text,
  referrer            text,
  recording_url       text,
  raw                 jsonb,
  collected_at        timestamptz not null default now(),
  primary key (clarity_project_id, session_id)
);

create index if not exists clarity_recordings_site_started_idx
  on public.clarity_recordings (site_id, started_at desc);

create index if not exists clarity_recordings_visited_paths_idx
  on public.clarity_recordings using gin (visited_paths);

alter table public.clarity_recordings enable row level security;

drop policy if exists clarity_recordings_select_authenticated on public.clarity_recordings;
create policy clarity_recordings_select_authenticated
  on public.clarity_recordings for select to authenticated using (true);

grant select on table public.clarity_recordings to authenticated;
grant select on table public.clarity_recordings to signals_reader;
