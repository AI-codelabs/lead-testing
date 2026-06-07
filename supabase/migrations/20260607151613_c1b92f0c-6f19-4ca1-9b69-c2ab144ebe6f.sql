
-- 1. conversion_uploads --------------------------------------------------
CREATE TABLE public.conversion_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  workspace_key text NOT NULL,
  network text NOT NULL,
  stage text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  conversion_action text,
  value numeric,
  currency text,
  click_id text,
  click_id_type text,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, network, stage)
);

GRANT ALL ON public.conversion_uploads TO service_role;
ALTER TABLE public.conversion_uploads ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER conversion_uploads_touch_updated_at
BEFORE UPDATE ON public.conversion_uploads
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX conversion_uploads_workspace_idx ON public.conversion_uploads (workspace_key, network, status);
CREATE INDEX conversion_uploads_lead_idx ON public.conversion_uploads (lead_id);

-- 2. google_ads_settings ------------------------------------------------
CREATE TABLE public.google_ads_settings (
  workspace_key text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  customer_id text NOT NULL,
  login_customer_id text,
  default_currency text NOT NULL DEFAULT 'EUR',
  conversion_action_new text,
  conversion_action_qualified text,
  conversion_action_won text,
  conversion_action_lost text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.google_ads_settings TO service_role;
ALTER TABLE public.google_ads_settings ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER google_ads_settings_touch_updated_at
BEFORE UPDATE ON public.google_ads_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Enrich leads -------------------------------------------------------
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS won_value numeric;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS qualification text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS wbraid text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS gbraid text NOT NULL DEFAULT '';
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz NOT NULL DEFAULT now();
