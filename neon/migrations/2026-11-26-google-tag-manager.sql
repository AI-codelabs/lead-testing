-- Google Tag Manager: install and publish the Leadlogr tracker for the customer.
--
-- A separate consent from Google Ads. The grant is stored the same way -- the
-- refresh token in ad_platform_credentials, which app_user cannot read, and the
-- single-use state in oauth_states -- so both get one more key value rather
-- than a parallel secrets table with its own grants to get wrong.
--
-- 'google_tag_manager' is not an ad network and is never written to
-- ad_platform_settings, conversion_uploads or ad_spend_daily. Its non-secret
-- state lives in tag_manager_installs below.
--
-- ADD VALUE is allowed inside a transaction as long as nothing in the same
-- transaction uses the new value, and nothing here does.
ALTER TYPE ad_network ADD VALUE IF NOT EXISTS 'google_tag_manager';

-- What the workspace sees: who connected, which container was chosen, and
-- what was last published there. No secrets.
CREATE TABLE IF NOT EXISTS public.tag_manager_installs (
  organization_id     uuid PRIMARY KEY REFERENCES neon_auth.organization(id) ON DELETE CASCADE,
  connected_email     text,
  connected_at        timestamptz,
  account_id          text,
  container_id        text,
  container_public_id text,
  container_name      text,
  container_url       text,
  last_version_id     text,
  last_version_url    text,
  last_published_at   timestamptz,
  last_result         text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS tag_manager_installs_touch ON public.tag_manager_installs;
CREATE TRIGGER tag_manager_installs_touch BEFORE UPDATE ON public.tag_manager_installs
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

-- Members read their own row. Every write goes through the owner connection
-- after the server has checked owner/admin, the same as the OAuth callback.
GRANT SELECT ON public.tag_manager_installs TO app_user;
ALTER TABLE public.tag_manager_installs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tag_manager_installs_read ON public.tag_manager_installs;
CREATE POLICY tag_manager_installs_read ON public.tag_manager_installs FOR SELECT TO app_user
  USING (app.is_member(organization_id));

COMMENT ON TABLE public.tag_manager_installs IS
  'Non-secret Google Tag Manager state. The refresh token is in ad_platform_credentials (network google_tag_manager).';
