# Readout tables and grain

Counts are from the live database on 2026-11-04. `signals_reader` is a nologin role with SELECT only (insert, update, delete, and truncate revoked). It bypasses RLS so it can read these tables. `public.ingest_delivery_status()` returns the latest cron and HTTP status for each scheduled pull.

Refresh: Clarity daily. GA4, Search Console, and Calendly every 3 days. RB2B and form captures are not on that cron.

**sites** — registry of properties and which source ids are set. One row per site. Keys: `id`, `slug`, `domain`. Created 2026-09-16, 4 rows. Not a pull.

**ingestion_runs** — one row per pull attempt (running, success, or error). Keys: `id`, `source`, `started_at`, `window_start`, `window_end`. 2026-09-17 to 2026-11-04, 44 rows. Written by each GA4, Search Console, Clarity, or Calendly run.

**ga4_daily** — site totals (sessions, users, pageviews, engagement). One row per site per day. `site_id`, `date`. 2025-05-26 to 2026-11-03, 717 rows. GA4, every 3 days.

**ga4_page_daily** — page metrics. One row per site, day, and `page_path`. Same range, 9,640 rows. GA4, every 3 days.

**ga4_landing_daily** — where sessions started. One row per site, day, and landing `page_path`. Same range, 9,252 rows. GA4, every 3 days.

**ga4_source_daily** — sessions by source and medium. One row per site, day, `source`, `medium`. Same range, 1,995 rows. GA4, every 3 days.

**ga4_channel_daily** — sessions by default channel. One row per site, day, and `channel`. Same range, 1,513 rows. GA4, every 3 days.

**ga4_country_daily** — sessions by country. One row per site, day, and `country_code`. Same range, 3,836 rows. GA4, every 3 days.

**ga4_device_daily** — sessions by device. One row per site, day, and `device`. Same range, 894 rows. GA4, every 3 days.

**ga4_os_daily** — sessions by operating system. One row per site, day, and `os`. Same range, 2,042 rows. GA4, every 3 days.

**ga4_key_events_daily** — key-event counts. One row per site, day, `event_key`, `page_path`, and `placement`. 0 rows. GA4, every 3 days.

**gsc_daily** — clicks, impressions, CTR, position. One row per site per day. `site_id`, `date`. 2025-06-16 to 2026-11-01, 858 rows. Search Console, every 3 days.

**gsc_query_daily** — the same metrics per query. One row per site, day, and `query`. 2025-06-17 to 2026-11-01, 12,037 rows. Search Console, every 3 days.

**gsc_index_status** — indexed and not-indexed snapshot. One row per site per observation `date`. 2026-09-18 to 2026-11-04, 10 rows. Search Console, every 3 days.

**clarity_daily** — project-level behavior rates. One row per Clarity project per day. `clarity_project_id`, `date`. 2026-09-16 to 2026-11-03, 17 rows. Clarity, daily.

**clarity_page_daily** — those rates per host and path. One row per project, day, `host`, and `page_path`. `site_id` is derived from the host. Same range, 348 rows. Clarity, daily.

**clarity_breakdown_daily** — sessions by device, browser, source, country, or OS. One row per project, day, `dimension`, and `key`. Same range, 416 rows. Clarity, daily.

**calendly_bookings** — one stored invitee. Key: `calendly_uri`. `booked_at` 2025-01-15 to 2026-10-26; `scheduled_at` through 2026-12-04; last sync 2026-11-04. 216 rows. Calendly, every 3 days. Names and emails are not part of this note.

**rb2b_visitors** — one identified visit. `captured_at`, `site_id`. 0 rows. RB2B, when a visit is posted.

**form_captures** — one anonymous form submission. Columns: `form_id`, `intent`, `page_url`, `site_domain`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `submitted_at`, `received_at`. No personal data. 0 rows. Site forms, on each submission.

## Known gaps

- Clarity facts are stored under the shared placeholder project id, and chrisrubincreativ.com's device, browser, country and source breakdowns are empty until it has its own Clarity project. Its page rows under the placeholder stop at 2026-09-23.
- No readout table with a `date` column is more than 3 days behind 2026-11-04. Search Console daily and query rows stop at 2026-11-01. `ga4_key_events_daily`, `rb2b_visitors`, and `form_captures` are empty.
- Primary: Storyline and Diagnostic calls. The CRC diagnostic slug counts to chrisrubincreativ.com; the other primary events count to brandmultiplier.ai.
- Partner: The Connector Fit Call.
- Relay: Quick Chat (the quick-chat event), counted as founder-relayed.
- Excluded: tests, company-domain addresses, interviews, and any other event outside the three classes above. Reported apart from the headline.

## Adding a new event

In `src/lib/ga4-event-rules.ts`, add one entry keyed by the GA4 event name. The pull requests `customEvent:` plus each required parameter and drops rows where it is empty or `(not set)`. Events with no entry are counted as they are today.

```ts
calendly_outbound_click: { requiredDimensions: ["placement"] },
```
