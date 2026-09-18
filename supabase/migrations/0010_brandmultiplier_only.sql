-- Dashboard currently tracks brandmultiplier.ai only. Other registry rows stay
-- in the table but are hidden. Display name is the domain, lowercase, no spaces.

update public.sites
set display_name = 'brandmultiplier.ai'
where slug = 'brandmultiplier';

update public.sites
set is_active = false
where slug in ('weservefounders', 'chrisrubincreativ', 'findyourstoryline');
