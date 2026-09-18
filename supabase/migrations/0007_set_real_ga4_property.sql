-- Real GA4 property for brandmultiplier.ai + weservefounders.com.
-- Placeholder IDs on other sites are cleared so ingest does not call a fake property.
-- weservefounders.com Search Console is unset until the service account is added there.

update public.sites
set ga4_property_id = null
where ga4_property_id like 'GA4_PROPERTY_ID_%';

update public.sites
set ga4_property_id = '527690219'
where slug in ('brandmultiplier', 'weservefounders');

update public.sites
set gsc_site_url = null
where slug = 'weservefounders';
