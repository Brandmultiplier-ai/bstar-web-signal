-- Chris Rubin Creative property IDs after the WordPress to Next.js move.
-- RB2B runs via GTM-PMWWPQ23; flag is a label only, no RB2B ID is stored.
-- The Search Console property is the column gsc_site_url.

update public.sites
set
  is_active = true,
  ga4_property_id = '368696015',
  ga4_hostname_filter = 'chrisrubincreativ.com',
  gsc_site_url = 'https://chrisrubincreativ.com/',
  clarity_project_id = 'yv4cy3vjqc',
  rb2b_enabled = true
where domain = 'chrisrubincreativ.com';
