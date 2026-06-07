
CREATE TABLE public.meta_ads_settings (
  workspace_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  pixel_id text NOT NULL DEFAULT '',
  access_token text,
  test_event_code text,
  default_currency text NOT NULL DEFAULT 'EUR',
  event_name_new text DEFAULT 'Lead',
  event_name_qualified text DEFAULT 'QualifiedLead',
  event_name_won text DEFAULT 'Purchase',
  event_name_lost text,
  connected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.meta_ads_settings TO service_role;

ALTER TABLE public.meta_ads_settings ENABLE ROW LEVEL SECURITY;
-- No policies: client never touches this table directly. All reads/writes go through
-- server functions using the service-role admin client. Access token is sensitive.

CREATE TRIGGER touch_meta_ads_settings_updated_at
BEFORE UPDATE ON public.meta_ads_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
