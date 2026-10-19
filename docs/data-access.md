# Web Signals data access

Read-only. Nothing in this note grants a write. Do not delete or overwrite stored history to fix a display question. Clarity cannot be backfilled: a day that was not saved is gone.

The Postgres role `signals_reader` can `SELECT` every table in `public` and cannot insert, update, or delete. It is created without a login password. Set one in the Supabase SQL editor, then connect with the direct database host, not the service-role key:

```sql
alter role signals_reader with login password 'choose-a-password';
```

The role can read invitee names and emails on `calendly_bookings`. Treat the password like the restricted credentials doc.

Signed-in dashboard users already have the same read access through row-level security. The service-role key is the only writer. It stays out of the browser.

## How to count bookings

Do not sum `calendly_bookings`. Use `calendly_booking_classes`.

- One row per scheduled event (`calendly_uri`).
- `conversion_class` is `primary`, `partner`, `relay`, or `excluded`.
- Primary is What's your Storyline? and the Diagnostic, including `book-crc/the-diagnostic-20-min-with-chris` once that event exists. `source_property` splits brandmultiplier.ai from chrisrubincreativ.com.
- Partner is The Connector Fit Call. Never add it to Primary.
- Relay is `book-crc/quick-chat`. Rows still titled Quick Q&A are that same event under an older display name, so they are Relay. A blank UTM on Relay is expected.
- `exclusion_reason` is `test`, `company-domain` (brandmultiplier.ai, chrisrubincreativ.com), or `outside-taxonomy`. Personal calendar entries, interviews, `book-crc/growth`, and `book-crc/resource-needs` are outside the taxonomy and are not counted.
- `superseded` is true when a reschedule replaced that invitee. Drop those rows.
- Count the remaining rows on `counted_at` (original creation), not `scheduled_at`.
- `status = 'canceled'` on a row that is not superseded is a cancellation. Report it. Do not add it to Primary, Partner, or Relay.

## Grain

| Relation | One row is | Watch-out |
| --- | --- | --- |
| `sites` | One property | `chrisrubincreativ` is active. Its GA4 property is `368696015` and its Clarity project is `yv4cy3vjqc`. The Clarity token returns one project; a second project is skipped instead of failing the pull |
| `ingestion_runs` | One ingest attempt | `status`, `finished_at`, `error`. A failure is a row here, not a zero in a fact table |
| `ga4_daily` | Site and date | Headline sessions |
| `ga4_page_daily`, `ga4_landing_daily`, `ga4_source_daily`, `ga4_country_daily`, `ga4_device_daily`, `ga4_channel_daily`, `ga4_os_daily` | Site, date, and one dimension value | Top values per day, not every value. They will not sum to `ga4_daily` |
| `ga4_key_events_daily` | Site, date, event, page, placement | Named events only. A zero means the event was not stored |
| `gsc_daily` | Site and date | Click and impression totals |
| `gsc_query_daily` | Site, date, and query | Strongest queries per day, not every query. Will not sum to `gsc_daily` |
| `gsc_index_status` | Latest coverage snapshot for a site | Not a date-range series |
| `clarity_daily` | Clarity project and date | Project-level. A missed day cannot be recovered |
| `clarity_page_daily` | Project, host, path, and date | Page behavior. Rows with no sessions are not a behavior rate |
| `clarity_breakdown_daily` | Project, date, dimension, and key | Device, browser, source, country, OS |
| `calendly_bookings` | One scheduled event | Raw store, including tests and personal events |
| `calendly_booking_classes` | Same event, with class and count date | The counting contract |
| `rb2b_visitors` | One identified visitor event | Identity, not traffic volume |

Repository layout for this app is `src/` and `supabase/migrations/`. Scheduled runs are the rows in `ingestion_runs`.
