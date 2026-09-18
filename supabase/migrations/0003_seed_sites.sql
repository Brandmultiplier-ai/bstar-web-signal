-- ---------------------------------------------------------------------------
-- Site registry seed
--
-- Property IDs, the Search Console URLs and the shared Clarity project ID are
-- placeholders: replace them with real values (or update the rows in the
-- Supabase dashboard) before enabling the cron jobs. Ingestion skips any site
-- whose config for a given source is null, so leaving a column unset is safe.
--
-- Note brandmultiplier.ai and weservefounders.com deliberately share the same
-- ga4_property_id and are separated by ga4_hostname_filter.
-- ---------------------------------------------------------------------------

insert into public.sites (
  slug, domain, display_name,
  ga4_property_id, ga4_hostname_filter,
  gsc_site_url, clarity_project_id,
  rb2b_enabled, is_active, sort_order
) values
  (
    'brandmultiplier', 'brandmultiplier.ai', 'Brand Multiplier',
    'GA4_PROPERTY_ID_BRANDMULTIPLIER', 'brandmultiplier.ai',
    'sc-domain:brandmultiplier.ai', 'CLARITY_SHARED_PROJECT_ID',
    true, true, 1
  ),
  (
    'weservefounders', 'weservefounders.com', 'We Serve Founders',
    -- Same property as brandmultiplier.ai on purpose; split by hostname.
    'GA4_PROPERTY_ID_BRANDMULTIPLIER', 'weservefounders.com',
    'sc-domain:weservefounders.com', 'CLARITY_SHARED_PROJECT_ID',
    false, true, 2
  ),
  (
    'chrisrubincreativ', 'chrisrubincreativ.com', 'Chris Rubin Creativ',
    'GA4_PROPERTY_ID_CHRISRUBINCREATIV', null,
    null, 'CLARITY_SHARED_PROJECT_ID',
    true, true, 3
  ),
  (
    -- Search Console, Clarity and RB2B status unconfirmed; inactive until then.
    'findyourstoryline', 'findyourstoryline.com', 'Find Your Storyline',
    'GA4_PROPERTY_ID_FINDYOURSTORYLINE', null,
    null, null,
    false, false, 4
  )
on conflict (slug) do nothing;
