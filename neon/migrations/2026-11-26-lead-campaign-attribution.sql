-- Campaign detail fields captured from ad landing URLs (ValueTrack / UTM aliases).
-- utm_campaign / utm_content / utm_term remain as the raw UTM copies; these columns
-- hold the human-facing campaign / ad group / keyword / search term when present.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS ad_group text,
  ADD COLUMN IF NOT EXISTS keyword text,
  ADD COLUMN IF NOT EXISTS search_term text;

COMMENT ON COLUMN public.leads.ad_group IS 'Ad group name or id from the landing URL (utm_content / adgroup / adgroupid).';
COMMENT ON COLUMN public.leads.keyword IS 'Matched keyword from the landing URL (utm_term / keyword).';
COMMENT ON COLUMN public.leads.search_term IS 'Search query when passed on the landing URL (search_term).';
