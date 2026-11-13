-- chrisrubin.com has the RB2B pixel installed through tag management.
-- The script key is not stored. This flag only tells the dashboard to read
-- company visits for the site. Visits still arrive through the shared webhook
-- and are matched by the page hostname.

update public.sites
set rb2b_enabled = true
where domain = 'chrisrubin.com';
