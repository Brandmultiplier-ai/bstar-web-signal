-- The rebuilt chrisrubincreativ.com site is live, so the dashboard may read it.
-- Clarity still has one API token. Ingest keeps the project whose hostnames
-- are in that response and skips the other, instead of failing the whole pull.

update public.sites
set is_active = true,
    ga4_hostname_filter = 'chrisrubincreativ.com'
where slug = 'chrisrubincreativ';
