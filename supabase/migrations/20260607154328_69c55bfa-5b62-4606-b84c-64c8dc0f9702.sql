
ALTER TABLE public.google_ads_settings
  ADD COLUMN IF NOT EXISTS oauth_refresh_token text,
  ADD COLUMN IF NOT EXISTS oauth_email text,
  ADD COLUMN IF NOT EXISTS connected_at timestamptz;

-- customer_id was NOT NULL; relax so a workspace can connect OAuth first, pick a customer after.
ALTER TABLE public.google_ads_settings
  ALTER COLUMN customer_id DROP NOT NULL,
  ALTER COLUMN customer_id SET DEFAULT '';

CREATE TABLE IF NOT EXISTS public.google_ads_oauth_states (
  state text PRIMARY KEY,
  workspace_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes')
);

GRANT ALL ON public.google_ads_oauth_states TO service_role;
ALTER TABLE public.google_ads_oauth_states ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only (used by server routes); users have no direct access.
