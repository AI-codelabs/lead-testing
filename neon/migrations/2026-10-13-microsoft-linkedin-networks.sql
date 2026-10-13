-- Microsoft Advertising and LinkedIn as reportable networks.
--
-- Both click identifiers have been captured and stored on every lead since the
-- tracker was written (leads.msclkid, leads.li_fat_id), but ad_network only
-- allowed the two networks that could be reported back to. There was nowhere
-- to keep their settings, credentials, upload records or spend, so the data
-- sat stranded: the dashboard could attribute a lead to LinkedIn and then had
-- no way to tell LinkedIn it closed.
--
-- Additive only. Every table keyed on ad_network -- ad_platform_settings,
-- ad_platform_credentials, conversion_uploads, ad_spend_daily -- accepts the
-- new values without further change, and no existing row is affected.
ALTER TYPE ad_network ADD VALUE IF NOT EXISTS 'microsoft_ads';
ALTER TYPE ad_network ADD VALUE IF NOT EXISTS 'linkedin_ads';
