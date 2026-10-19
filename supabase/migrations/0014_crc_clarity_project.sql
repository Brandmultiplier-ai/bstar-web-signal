-- Chris Rubin Creative's own Clarity project.
-- The site stays inactive until the rebuilt site is live.
-- Clarity ingest allows one project per API token. Activating this row
-- beside brandmultiplier's project will fail the Clarity pull until the
-- token matches this project, or ingest is split per project.

update public.sites
set clarity_project_id = 'yv4cy3vjqc'
where slug = 'chrisrubincreativ';
