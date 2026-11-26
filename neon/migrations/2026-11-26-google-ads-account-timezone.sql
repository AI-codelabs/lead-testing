-- Google Ads account timezone for conversionDateTime uploads.
-- Google accepts any offset, but day buckets in the Ads UI match the account
-- timezone — so we store the IANA zone from the selected customer and format
-- every upload with that offset (including DST).

ALTER TABLE public.ad_platform_settings
  ADD COLUMN IF NOT EXISTS account_timezone text;

COMMENT ON COLUMN public.ad_platform_settings.account_timezone IS
  'IANA timezone of the selected ad account (e.g. America/Los_Angeles). Used when formatting Google Ads conversionDateTime.';
