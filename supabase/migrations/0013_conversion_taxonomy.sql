-- Conversion taxonomy support, read-only access, and hold on chrisrubincreativ.com.
--
-- New booking columns are additive. Existing rows are not rewritten or deleted.
-- Slug and reschedule links are filled on the next Calendly sync.
-- chrisrubincreativ.com stays in the registry but inactive until the rebuilt
-- site is live, so WordPress history is not blended into the new property.

alter table public.calendly_bookings
  add column if not exists event_type_uri text,
  add column if not exists event_slug text,
  add column if not exists invitee_uri text,
  add column if not exists rescheduled boolean,
  add column if not exists old_invitee_uri text,
  add column if not exists new_invitee_uri text;

create index if not exists calendly_bookings_invitee_uri_idx
  on public.calendly_bookings (invitee_uri);

create index if not exists calendly_bookings_booked_at_idx
  on public.calendly_bookings (booked_at desc);

update public.sites
set is_active = false
where slug = 'chrisrubincreativ';

do $$
begin
  create role signals_reader nologin;
exception
  when duplicate_object then null;
end $$;

grant usage on schema public to signals_reader;
grant select on all tables in schema public to signals_reader;
-- Select-only, so bypassing RLS does not grant a write. Without this, the
-- role would see zero rows: every ingest table has RLS and no policy for it.
alter role signals_reader bypassrls;
alter default privileges in schema public grant select on tables to signals_reader;
revoke insert, update, delete, truncate on all tables in schema public from signals_reader;

-- One row per stored booking, with the taxonomy applied.
-- Sum only rows where superseded is false. Headline counts also omit
-- cancellations and conversion_class = 'excluded'. Count on counted_at
-- (original creation), not scheduled_at.
create or replace view public.calendly_booking_classes
with (security_invoker = true) as
with recursive walk as (
  select
    b.calendly_uri,
    b.invitee_uri as pointer,
    b.booked_at as counted_at,
    0 as depth
  from public.calendly_bookings b
  union all
  select
    w.calendly_uri,
    parent.invitee_uri,
    parent.booked_at,
    w.depth + 1
  from walk w
  join public.calendly_bookings current_row
    on current_row.invitee_uri = w.pointer
  join public.calendly_bookings parent
    on parent.invitee_uri = current_row.old_invitee_uri
  where w.depth < 8
    and current_row.old_invitee_uri is not null
),
roots as (
  select distinct on (calendly_uri)
    calendly_uri,
    counted_at
  from walk
  order by calendly_uri, depth desc
),
labeled as (
  select
    b.*,
    lower(replace(replace(coalesce(b.event_name, ''), '’', ''''), '`', '''')) as event_name_key,
    lower(trim(both '/' from coalesce(b.event_slug, ''))) as event_slug_key,
    lower(split_part(coalesce(b.invitee_email, ''), '@', 2)) as email_domain,
    coalesce(r.counted_at, b.booked_at, b.scheduled_at) as counted_at,
    (
      b.new_invitee_uri is not null
      and exists (
        select 1
        from public.calendly_bookings successor
        where successor.invitee_uri = b.new_invitee_uri
      )
    ) as superseded
  from public.calendly_bookings b
  left join roots r on r.calendly_uri = b.calendly_uri
)
select
  calendly_uri,
  event_name,
  event_slug,
  status,
  scheduled_at,
  booked_at,
  counted_at,
  invitee_name,
  invitee_email,
  utm_source,
  utm_medium,
  utm_campaign,
  utm_content,
  utm_term,
  superseded,
  case
    when invitee_name ~* '(^|[^a-z])test' or split_part(coalesce(invitee_email, ''), '@', 1) ~* '(^|[^a-z])test'
      then 'excluded'
    when email_domain in ('brandmultiplier.ai', 'chrisrubincreativ.com')
      then 'excluded'
    when event_slug_key = 'book-crc/the-diagnostic-20-min-with-chris'
      or event_slug_key = 'book-crc/storyline'
      or event_name_key = 'what''s your storyline?'
      or event_slug_key like '%diagnostic%'
      or event_name_key like '%diagnostic%'
      then 'primary'
    when event_slug_key = 'book-crc/connector-call' or event_name_key = 'the connector fit call'
      then 'partner'
    when event_slug_key = 'book-crc/quick-chat' or event_name_key = 'quick chat'
      then 'relay'
    else 'excluded'
  end as conversion_class,
  case
    when invitee_name ~* '(^|[^a-z])test' or split_part(coalesce(invitee_email, ''), '@', 1) ~* '(^|[^a-z])test'
      then null
    when email_domain in ('brandmultiplier.ai', 'chrisrubincreativ.com')
      then null
    when event_slug_key = 'book-crc/the-diagnostic-20-min-with-chris'
      then 'chrisrubincreativ.com'
    when event_slug_key = 'book-crc/storyline'
      or event_name_key = 'what''s your storyline?'
      or event_slug_key like '%diagnostic%'
      or event_name_key like '%diagnostic%'
      then 'brandmultiplier.ai'
    else null
  end as source_property,
  case
    when invitee_name ~* '(^|[^a-z])test' or split_part(coalesce(invitee_email, ''), '@', 1) ~* '(^|[^a-z])test'
      then 'test'
    when email_domain in ('brandmultiplier.ai', 'chrisrubincreativ.com')
      then 'company-domain'
    when event_slug_key in (
        'book-crc/the-diagnostic-20-min-with-chris',
        'book-crc/storyline',
        'book-crc/connector-call',
        'book-crc/quick-chat'
      )
      or event_name_key in ('what''s your storyline?', 'the connector fit call', 'quick chat')
      or event_slug_key like '%diagnostic%'
      or event_name_key like '%diagnostic%'
      then null
    else 'outside-taxonomy'
  end as exclusion_reason
from labeled;

revoke all on public.calendly_booking_classes from public, anon;
grant select on public.calendly_booking_classes to authenticated, signals_reader;
