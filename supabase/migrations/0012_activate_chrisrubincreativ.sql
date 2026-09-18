-- Activate chrisrubincreativ.com as a second dashboard site.
-- Own GA4 property (no hostname split). URL-prefix Search Console.
-- Clarity stays on the shared brandmultiplier project; Calendly is account-wide.

update public.sites
set
  is_active = true,
  display_name = 'chrisrubincreativ.com',
  ga4_property_id = '368696015',
  ga4_hostname_filter = null,
  gsc_site_url = 'https://chrisrubincreativ.com/',
  clarity_project_id = 'CLARITY_SHARED_PROJECT_ID',
  sort_order = 2
where slug = 'chrisrubincreativ';
